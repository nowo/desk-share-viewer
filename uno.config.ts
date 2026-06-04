import { defineConfig, presetIcons, presetWind4, transformerDirectives, transformerVariantGroup } from 'unocss'

export default defineConfig({
    presets: [
        presetWind4(),
        presetIcons({
            scale: 1.0,
            extraProperties: {
                'display': 'inline-block',
                'vertical-align': 'middle',
            },
        }),
    ],
    transformers: [transformerDirectives(), transformerVariantGroup()],
})
