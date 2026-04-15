module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['module-resolver', { root: ['./'], alias: { '@': './src' } }],
      // TODO(Task 2): add react-native-reanimated/plugin here as the LAST plugin
    ],
  }
}
