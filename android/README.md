# Chem Tutor for Android

A small Android app that runs the Chem Tutor web app
(https://death7310.github.io/Chem-tutoring-/) in its own window, adding the camera, file
picking and saving backups to Downloads.

**Download:** https://github.com/Death7310/Chem-tutoring-/releases/latest/download/chem-tutor.apk

The APK is built by `.github/workflows/android.yml` whenever `android/` changes on `main`
(or manually from the Actions tab). Because the app loads the website, **most updates
(tutor, problems, review) arrive automatically** without reinstalling.

## Signing key

Each build is signed with a key generated during that build and then discarded, so no signing
key is stored in this repository. As a result, a newly built APK won't install over an older
one: uninstall the old app first, after backing up study data (Settings → Back up study data).
This rarely matters, because the app gets most updates from the website. For seamless APK
updates, store a private key as a repository secret and use it in the workflow instead.
