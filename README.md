# IXORA Studio 2.0

Offline-first manual photo editor and local file toolkit. No account, API key, AI model, or server-side image upload is required.

## Included tools
- Photo editor: crop presets, rotate, flip, text and shape layers, drawing, eraser, layer list and undo/redo.
- Image adjustment: brightness, contrast, saturation, exposure and temperature.
- Filters: vintage, HDR-style contrast, black & white, film, blur and vignette.
- Background: manual polygon selection, manual brush erasing to transparency, and restore brush.
- Image tools: resize, JPEG compression, PNG/JPEG/WEBP conversion, watermark, border and collage.
- Batch: batch resize, batch conversion and batch rename.
- File tools: ZIP extraction for stored/deflate entries, browser-local file manager and download history.
- Manual dress editor: add a separate clothing image layer and position/scale/opacity controls.

## Run
Serve this directory using a local static server or HTTPS. For example:

```sh
python -m http.server 8080
```

Open `http://localhost:8080`.

## Android APK
The GitHub Actions workflow copies the offline web assets into `www/`, then builds a debug APK on pushes to `main` or when manually run. It uses Capacitor 6 and Java 17. The workflow artifact is named `IXORA-Studio-debug-APK`.

## Limitations
- Background selection and erasing are manual tools. They do not detect a person or automatically remove a background.
- Dress editing is a manually positioned image overlay. It does not warp clothing to body shape or generate a replacement garment.
- ZIP support covers common unencrypted ZIP entries using stored or DEFLATE compression. Password-protected and uncommon compression formats are not supported.
- Sharpness uses a local 3×3 convolution and can be slow on very large images.
- The editor uses browser memory; very large images may exceed the device's available memory.
- Browser file storage and download history are local to the current browser profile and can be cleared by browser settings.
