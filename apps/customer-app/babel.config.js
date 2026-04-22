module.exports = function (api) {
  // cache per NODE_ENV so test and non-test configs are cached separately
  api.cache.using(() => process.env.NODE_ENV)
  const isTest = process.env.NODE_ENV === 'test'
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['module-resolver', { root: ['./'], alias: { '@': './src' } }],
      // reanimated worklet compiler is heavy — skip in test env (reanimated is mocked anyway)
      ...(isTest ? [] : ['react-native-reanimated/plugin']),
    ],
  }
}
