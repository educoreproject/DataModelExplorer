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
            primary: '#072A6C',
            secondary: '#00B5B8',
            accent: '#FFAB40',
            background: '#F8F9FC',
            surface: '#FFFFFF',
            error: '#B00020',
            info: '#072A6C',
            success: '#00B5B8',
            warning: '#FFAB40',
            'on-primary': '#FFFFFF',
            'on-secondary': '#FFFFFF',
            'on-background': '#111827',
            'on-surface': '#111827',
          },
        },
      },
    },
    defaults: {
      VBtn: {
        variant: 'flat',
        color: 'primary',
        style: 'border-radius: 6px; font-weight: 600; letter-spacing: 0; text-transform: none;',
      },
      VAppBar: {
        color: 'surface',
      },
      VCard: {
        elevation: 0,
        style: 'border-radius: 12px; box-shadow: 0 2px 12px rgba(7,42,108,.08), 0 0 0 1px rgba(7,42,108,.06);',
      },
      VSheet: {
        color: 'surface',
      },
      VTextField: {
        variant: 'outlined',
        color: 'secondary',
        style: 'border-radius: 6px;',
      },
      VList: {
        color: 'surface',
      },
      VChip: {
        style: 'font-weight: 600; font-size: 11px;',
      },
      VProgressLinear: {
        color: 'secondary',
      },
      VToolbar: {
        color: 'surface',
      },
      VNavigationDrawer: {
        color: 'surface',
        elevation: 0,
        style: 'border-right: 1px solid #EEF1F7;',
      },
      VExpansionPanels: {
        style: 'border-radius: 12px;',
      },
    },
  })
  nuxtApp.vueApp.use(vuetify)
})
