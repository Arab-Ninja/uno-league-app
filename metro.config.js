const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Add the react-native-css-interop cache directory to Metro's watch list.
// Without this, Metro cannot compute the SHA-1 for the generated web.css file
// when forceWriteFileSystem is enabled, causing a bundling crash on web.
const cssInteropCacheDir = path.resolve(
  __dirname,
  "node_modules/react-native-css-interop/.cache",
);
config.watchFolders = [...(config.watchFolders ?? []), cssInteropCacheDir];

module.exports = withNativeWind(config, {
  input: "./global.css",
  // Force write CSS to file system instead of virtual modules
  // This fixes iOS styling issues in development mode
  forceWriteFileSystem: true,
});
