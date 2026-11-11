package id.sch.baitussalam.cbt

import android.content.res.Configuration
import android.os.Bundle
import androidx.activity.OnBackPressedCallback
import com.getcapacitor.BridgeActivity
import com.getcapacitor.CapConfig

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(CbtNativePlugin::class.java)
        // Aplikasi memuat situs sekolah langsung, jadi pembaruan web sampai ke pengguna tanpa rilis APK baru.
        config = CapConfig.Builder(this)
            .setServerUrl(BuildConfig.SERVER_URL)
            .setAppendedUserAgentString("CbtApp/" + BuildConfig.VERSION_NAME)
            .create()
        super.onCreate(savedInstanceState)

        // Tombol back mengikuti history halaman (dipakai penangan back di web); di halaman pertama aplikasi
        // dipindahkan ke latar, bukan ditutup, agar ujian yang berjalan tidak dimuat ulang.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val webView = bridge?.webView
                if (webView != null && webView.canGoBack()) webView.goBack() else moveTaskToBack(true)
            }
        })
    }

    override fun onMultiWindowModeChanged(isInMultiWindowMode: Boolean, newConfig: Configuration) {
        super.onMultiWindowModeChanged(isInMultiWindowMode, newConfig)
        // Web mencatatnya sebagai pelanggaran "split-screen" selama ujian berlangsung.
        if (isInMultiWindowMode) bridge?.triggerWindowJSEvent("cbtnativesplit")
    }
}
