#!/bin/zsh
# Archives a Release build and uploads it to App Store Connect (TestFlight).
# Signs automatically with the team in project.yml, using the Apple ID signed in to Xcode.
# Bump CURRENT_PROJECT_VERSION in project.yml before each new upload: App Store Connect
# refuses a build number it has already seen for the same version.
# Usage: Scripts/archive.sh            archive and upload
#        Scripts/archive.sh --no-upload archive only
set -euo pipefail
cd "$(dirname "$0")/.."
command -v xcodegen >/dev/null && xcodegen generate --quiet
build=$(grep -m1 CURRENT_PROJECT_VERSION project.yml | grep -o '[0-9]\+')
archive=build/WorldSurvey-$build.xcarchive
xcodebuild -project WorldSurvey.xcodeproj -scheme WorldSurvey -configuration Release -destination 'generic/platform=iOS' \
  -archivePath "$archive" -allowProvisioningUpdates archive -quiet
echo "Archived build $build: $archive"
[[ "${1:-}" == "--no-upload" ]] && exit 0
xcodebuild -exportArchive -archivePath "$archive" -exportOptionsPlist Config/ExportOptions-Upload.plist \
  -exportPath build/upload-$build -allowProvisioningUpdates
echo "Uploaded build $build"
