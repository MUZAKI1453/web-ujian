import multer from 'multer';

const storage = multer.memoryStorage(); // Simpan file sementara di RAM (buffer)
export const uploadExcel = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype.includes('excel') || file.originalname.match(/\.(xlsx|xls)$/)) {
            cb(null, true);
        } else {
            cb(new Error('Hanya file Excel (.xlsx, .xls) yang diizinkan!'));
        }
    }
});