const VueLoaderPlugin = require('vue-loader/lib/plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
var FriendlyErrorsWebpackPlugin = require('friendly-errors-webpack-plugin');
const path = require("path");

module.exports = {
    mode: "production",
    stats: 'none',
    entry: "./index.ts",
    externals: {
        vue: 'vue',
        "vue-class-component": "vue-class-component"
    },
    resolve: {
        // Add `.ts` and `.tsx` as a resolvable extension (so that you don't have to add it explicitly)
        extensions: [".ts", ".tsx", ".js"]
    },
    output: {
        // Production
        //filename: '[name].[contenthash].js',
        // Development:
        path: path.resolve(__dirname, "dist"),
        filename: '[name].js',
        libraryTarget: 'commonjs2',
    },
    devtool: "sourcemap",
    module: {
        rules: [
            {
                test: /\.vue$/,
                loader: 'vue-loader'
            },
            {
                test: /\.tsx?$/,
                loader: "ts-loader",
                options: { appendTsSuffixTo: [/\.vue$/] }
            },
            {
                test: /\.css$/,
                use: [
                    'style-loader',
                    'css-loader',
                ],
            },
            // this will apply to both plain `.css` files
            // AND `<style>` blocks in `.vue` files
            {
                test: /\.scss$/,
                use: [
                    MiniCssExtractPlugin.loader, // If you enable this, HMR won't work. Replace it with a style loader
                    // 'vue-style-loader', // sets the style inline, instead of using MiniCssExtractPlugin.loader
                    'css-loader',
                    'sass-loader'
                ]
            }
        ],
    },
    plugins: [
        // make sure to include the plugin!
        new FriendlyErrorsWebpackPlugin(),
        new CleanWebpackPlugin(), // Clear the dist folder before building
        new VueLoaderPlugin(), // Allow .vue files
        new MiniCssExtractPlugin({ // Make sure CSS is not put inline, but saved to a seperate file
            filename: '[name].css',
            chunkFilename: '[id].css',
        })
    ]
};
