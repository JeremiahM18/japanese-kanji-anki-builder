module.exports = [
    {
        files: ["**/*.js"],
        ignores: ["node_modules/**", "cache/**", "out/**"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "commonjs",
        },
        rules: {
            "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
            "no-constant-condition": "error",
            "no-console": "off",
        },
    },
];

