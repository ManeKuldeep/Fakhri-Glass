#!/bin/bash
# Re-applies release signing to the generated android/app/build.gradle.
# Run this after every "npx expo prebuild --clean". It reads no secrets;
# the passwords come from ~/.gradle/gradle.properties.
set -e
F="android/app/build.gradle"

if [ ! -f "$F" ]; then echo "ERROR: $F not found. Run from the project folder."; exit 1; fi
if grep -q "signingConfigs.release" "$F"; then echo "Already applied. Nothing to do."; exit 0; fi

python3 - "$F" <<'PY'
import sys, re
p = sys.argv[1]
s = open(p).read()

release_cfg = """
        release {
            if (!project.hasProperty('FAKHRI_UPLOAD_STORE_FILE')) {
                throw new GradleException('FAKHRI_UPLOAD_* signing properties are missing from ~/.gradle/gradle.properties')
            }
            storeFile file(FAKHRI_UPLOAD_STORE_FILE)
            storePassword FAKHRI_UPLOAD_STORE_PASSWORD
            keyAlias FAKHRI_UPLOAD_KEY_ALIAS
            keyPassword FAKHRI_UPLOAD_KEY_PASSWORD
        }
"""
# 1. add the release config after the debug config block
s, n1 = re.subn(r"(keyPassword 'android'\n        \})\n(    \})", r"\1" + release_cfg + r"\2", s, count=1)
# 2. point the release build type at it (only inside release { ... })
s, n2 = re.subn(r"(release \{\n(?:\s*//[^\n]*\n)*\s*)signingConfig signingConfigs\.debug", r"\1signingConfig signingConfigs.release", s, count=1)
if n1 != 1 or n2 != 1:
    print("ERROR: build.gradle layout not as expected (%d, %d). No change written." % (n1, n2)); sys.exit(1)
open(p, "w").write(s)
print("Release signing applied.")
PY
