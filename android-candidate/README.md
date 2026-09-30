# Panchayat Digital Candidate Android App

V1 Android app shell for candidates. Super Admin remains web-only and the existing Supabase backend remains unchanged.

Current V1 uses the secured Candidate web dashboard inside an Android WebView, so the same login, panchayat_access authorization, voter search, Ward/Colony/House, A-Z and slip tools are available in one APK.

Security: no Supabase service-role or secret key is included in the Android source. Authorization remains enforced by Supabase RLS.

Build: open the android-candidate folder in Android Studio and build an APK.

Next: native/offline screens and portable-printer support.
