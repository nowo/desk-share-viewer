import antfu from '@antfu/eslint-config'

export default antfu(
    {
        unocss: true,
        // formatters: true,
        stylistic: {
            indent: 4, // 4, or 'tab'
            quotes: 'single', // or 'double'
        },
        lessOpinionated: true, // 去除antfu的配置
        // eslint 忽略文件
        ignores: [
            '.github/workflows/*.yml',
            'public/tinymce/**',
            'pnpm-**.yaml',
            '.claude/**', // Claude Code agent 模板和配置，内含 `I<Model>` 等占位符语法，不参与 lint
        ],
    },
    {
        rules: {
            'no-console': [
                'warn',
                {
                    allow: ['error', 'warn'],
                },
            ],
            'unused-imports/no-unused-vars': [
                'warn',
                {
                    vars: 'all',
                    varsIgnorePattern: '^_',
                    // "args": "after-used",
                    argsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                },
            ],
            'curly': ['error', 'multi-line', 'consistent'], // 统一的大括号
            'style/brace-style': ['error', '1tbs', { allowSingleLine: true }], // 统一的大括号
        },
    },
    {
        // electron-builder 配置里的 ${productName} ${version} ${arch}
        // 是它自己的模板字符串语法（编译时由 electron-builder 自己替换），不是 JS 模板字面量
        files: ['electron-builder.ts'],
        rules: {
            'no-template-curly-in-string': 'off',
        },
    },
    {
        // Remember to specify the file glob here, otherwise it might cause the vue plugin to handle non-vue files
        files: ['**/*.vue'],
        rules: {
            'vue/first-attribute-linebreak': [
                'warn',
                {
                    multiline: 'beside',
                },
            ],
            'vue/html-indent': ['error', 4, {
                alignAttributesVertically: false,
            }],
            'vue/html-closing-bracket-newline': [
                'error',
                {
                    singleline: 'never',
                    multiline: 'never',
                    selfClosingTag: {
                        singleline: 'never',
                        multiline: 'never',
                    },
                },
            ],
            'vue/no-multiple-template-root': ['off'],
        },
    },
)
