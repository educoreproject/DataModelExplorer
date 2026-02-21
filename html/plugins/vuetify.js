import { createVuetify } from 'vuetify'
import 'vuetify/styles'

// import this after install `@mdi/font` package
import '@mdi/font/css/materialdesignicons.css'
import { aliases, mdi } from 'vuetify/iconsets/mdi'

export default defineNuxtPlugin(nuxtApp => {
  const vuetify = createVuetify({
    icons: {
      defaultSet: 'mdi',
      aliases,
      sets: {
        mdi,
      },
    },
    theme: {
      defaultTheme: 'educoreTheme',
      themes: {
        educoreTheme: {
          dark: false,
          colors: {
            primary: '#2c5f8a',
            secondary: '#3a6f9a',
            accent: '#4a7faa',
            background: '#fafaf8',
            surface: '#ffffff',
            error: '#B00020',
            info: '#2c5f8a',
            success: '#2e7d32',
            warning: '#f9a825',
            'on-primary': '#ffffff',
            'on-secondary': '#ffffff',
            'on-background': '#333333',
            'on-surface': '#333333',
          },
        },
      },
    },
    defaults: {
      VBtn: {
        variant: 'flat',
        color: 'primary',
      },
      VAppBar: {
        color: 'surface',
      },
      VCard: {
        elevation: 1,
      },
      VSheet: {
        color: 'surface',
      },
      VTextField: {
        variant: 'outlined',
        color: 'primary',
      },
      VList: {
        color: 'surface',
      },
      VProgressLinear: {
        color: 'primary',
      },
      VToolbar: {
        color: 'surface',
      },
    },
  })
  nuxtApp.vueApp.use(vuetify)
})
