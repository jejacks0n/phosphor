const { ProvidePlugin } = require('webpack');
const { defineConfig } = require('@vue/cli-service');

module.exports = defineConfig({
  transpileDependencies: true,
  configureWebpack: {
    resolve: {
      fallback: {
        buffer: require.resolve('buffer/'),
      },
    },
    plugins: [
      new ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
      }),
    ],
  },
});
