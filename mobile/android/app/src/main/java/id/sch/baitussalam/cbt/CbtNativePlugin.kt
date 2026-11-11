package id.sch.baitussalam.cbt

import android.app.ActivityManager
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.view.WindowManager
import android.widget.Toast
import androidx.core.content.FileProvider
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File

/**
 * Jembatan native untuk situs CBT. Dipanggil dari web lewat window.Capacitor.Plugins.CbtNative.
 *
 * Mode ujian: blokir screenshot dan rekam layar, layar tetap menyala, bilah sistem disembunyikan,
 * dan (bila diminta) aplikasi disematkan ke layar. Ini mempersulit keluar dari ujian tetapi bukan kunci
 * perangkat: di HP pribadi penyematan bisa dilepas pengguna, dan web tetap mencatatnya sebagai pelanggaran.
 */
@CapacitorPlugin(name = "CbtNative")
class CbtNativePlugin : Plugin() {
    private val examFlags = WindowManager.LayoutParams.FLAG_SECURE or WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
    private var examMode = false

    private fun pinned(): Boolean {
        val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        return manager.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE
    }

    private fun state() = JSObject().put("examMode", examMode).put("pinned", pinned())
        .put("multiWindow", activity.isInMultiWindowMode).put("version", BuildConfig.VERSION_NAME)

    @PluginMethod
    fun status(call: PluginCall) = call.resolve(state())

    @PluginMethod
    fun enableExamMode(call: PluginCall) {
        val pin = call.getBoolean("pin", false) == true
        activity.runOnUiThread {
            val window = activity.window
            window.addFlags(examFlags)
            WindowCompat.getInsetsController(window, window.decorView).apply {
                systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                hide(WindowInsetsCompat.Type.systemBars())
            }
            // Tanpa hak pemilik perangkat, Android meminta persetujuan pengguna untuk menyematkan aplikasi.
            var pinError: String? = null
            if (pin && !pinned()) try { activity.startLockTask() } catch (error: Exception) { pinError = error.message ?: error.javaClass.simpleName }
            examMode = true
            call.resolve(state().put("pinError", pinError))
        }
    }

    @PluginMethod
    fun disableExamMode(call: PluginCall) {
        activity.runOnUiThread {
            val window = activity.window
            window.clearFlags(examFlags)
            WindowCompat.getInsetsController(window, window.decorView).show(WindowInsetsCompat.Type.systemBars())
            if (pinned()) try { activity.stopLockTask() } catch (_: Exception) { }
            examMode = false
            call.resolve(state())
        }
    }

    /** Menyimpan berkas hasil unduhan web (template, rekap nilai). WebView tidak bisa mengunduh blob sendiri. */
    @PluginMethod
    fun saveFile(call: PluginCall) {
        val name = call.getString("name")?.replace(Regex("[\\\\/:*?\"<>|\\u0000-\\u001f]"), "_")?.take(120)
        val data = call.getString("data")
        val mime = call.getString("mime") ?: "application/octet-stream"
        if (name.isNullOrBlank() || data == null) return call.reject("Nama dan isi berkas wajib diisi.")
        try {
            val bytes = Base64.decode(data, Base64.DEFAULT)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val resolver = context.contentResolver
                val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, name)
                    put(MediaStore.Downloads.MIME_TYPE, mime)
                    put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                }) ?: return call.reject("Folder Download tidak tersedia.")
                resolver.openOutputStream(uri)?.use { it.write(bytes) } ?: return call.reject("Berkas tidak dapat ditulis.")
                activity.runOnUiThread { Toast.makeText(context, "Tersimpan di folder Download: $name", Toast.LENGTH_LONG).show() }
                call.resolve(JSObject().put("saved", true).put("uri", uri.toString()))
            } else {
                // Android 9 ke bawah: tanpa izin penyimpanan, berkas dibagikan lewat aplikasi pilihan pengguna.
                val file = File(context.cacheDir, name).apply { writeBytes(bytes) }
                val uri = FileProvider.getUriForFile(context, context.packageName + ".fileprovider", file)
                val send = Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM, uri)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                activity.startActivity(Intent.createChooser(send, name))
                call.resolve(JSObject().put("saved", false).put("shared", true))
            }
        } catch (error: Exception) {
            call.reject("Berkas gagal disimpan.", error)
        }
    }
}
