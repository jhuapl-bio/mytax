const { defineConfig } = require('@vue/cli-service')


const NodePolyfillPlugin = require("node-polyfill-webpack-plugin");

module.exports = defineConfig({
  transpileDependencies: [ 
    'vuetify'
  ],
  publicPath: '/mytax',
  configureWebpack: {
    plugins: [new NodePolyfillPlugin()],
    optimization: {
      splitChunks: {
        chunks: "all",
      },
    },
  },

})
