module.exports = [
    {
        ignores: ["node_modules/**", "cache/**", "out/**"],
    },
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "commonjs",
        },
        rules: {
            "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
            "no-constant-condition": "error",
            eqeqeq: ["error", "always"],
            "no-console": "off",
            "no-prototype-builtins": "error",
            "no-var": "error",
        },
    },
];

