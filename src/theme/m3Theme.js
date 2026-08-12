import { createTheme } from '@mui/material/styles';

/**
 * Material Design 3 (M3) Official Token System
 * Reference: https://m3.material.io/styles/color/the-color-system/tokens
 */
export const m3ColorTokens = {
  // Primary (Blue Tone for Austin Parking Company)
  primary: '#0A66C2',
  onPrimary: '#FFFFFF',
  primaryContainer: '#D7E3FF',
  onPrimaryContainer: '#001B3E',

  // Secondary
  secondary: '#535F70',
  onSecondary: '#FFFFFF',
  secondaryContainer: '#D7E3F8',
  onSecondaryContainer: '#101C2B',

  // Tertiary
  tertiary: '#6B5778',
  onTertiary: '#FFFFFF',
  tertiaryContainer: '#F2DAFF',
  onTertiaryContainer: '#251431',

  // Status & System Colors
  error: '#BA1A1A',
  onError: '#FFFFFF',
  errorContainer: '#FFDAD6',
  onErrorContainer: '#410002',

  success: '#059669',
  onSuccess: '#FFFFFF',
  successContainer: '#D1FAE5',
  onSuccessContainer: '#064E3B',

  warning: '#D97706',
  onWarning: '#FFFFFF',
  warningContainer: '#FEF3C7',
  onWarningContainer: '#78350F',

  // Surfaces & Backgrounds
  background: '#F8FAFC',
  onBackground: '#0F172A',

  surface: '#FFFFFF',
  onSurface: '#0F172A',
  surfaceVariant: '#E2E8F0',
  onSurfaceVariant: '#475569',
  surfaceContainerLow: '#F8FAFC',
  surfaceContainer: '#F1F5F9',
  surfaceContainerHigh: '#E2E8F0',
  surfaceContainerHighest: '#CBD5E1',

  // Outlines & Borders
  outline: '#94A3B8',
  outlineVariant: '#CBD5E1',
};

export const m3Theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: m3ColorTokens.primary,
      contrastText: m3ColorTokens.onPrimary,
      light: m3ColorTokens.primaryContainer,
      dark: '#00497D',
    },
    secondary: {
      main: m3ColorTokens.secondary,
      contrastText: m3ColorTokens.onSecondary,
      light: m3ColorTokens.secondaryContainer,
    },
    error: {
      main: m3ColorTokens.error,
      contrastText: m3ColorTokens.onError,
      light: m3ColorTokens.errorContainer,
    },
    background: {
      default: m3ColorTokens.background,
      paper: m3ColorTokens.surface,
    },
    text: {
      primary: m3ColorTokens.onSurface,
      secondary: m3ColorTokens.onSurfaceVariant,
    },
  },
  typography: {
    fontFamily: "'Roboto', 'Inter', system-ui, sans-serif",
    h1: {
      fontSize: '2.25rem',
      fontWeight: 700,
      lineHeight: 1.2,
      letterSpacing: '-0.02em',
    },
    h2: {
      fontSize: '1.75rem',
      fontWeight: 600,
      lineHeight: 1.25,
    },
    h3: {
      fontSize: '1.375rem',
      fontWeight: 600,
      lineHeight: 1.3,
    },
    h4: {
      fontSize: '1.125rem',
      fontWeight: 600,
    },
    body1: {
      fontSize: '0.9375rem',
      lineHeight: 1.5,
    },
    body2: {
      fontSize: '0.84375rem',
      lineHeight: 1.43,
    },
    button: {
      textTransform: 'none',
      fontWeight: 600,
      fontSize: '0.875rem',
    },
  },
  shape: {
    borderRadius: 12, // M3 medium corner radius
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 20, // M3 Pill buttons
          height: 40,
          paddingLeft: 20,
          paddingRight: 20,
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0px 1px 3px 1px rgba(0, 0, 0, 0.15)',
          },
        },
        containedPrimary: {
          backgroundColor: m3ColorTokens.primary,
          color: m3ColorTokens.onPrimary,
        },
        outlined: {
          borderColor: m3ColorTokens.outline,
          borderRadius: 20,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 16, // M3 Card corner shape
          backgroundImage: 'none',
          boxShadow: '0px 1px 3px 1px rgba(0, 0, 0, 0.05), 0px 1px 2px 0px rgba(0, 0, 0, 0.08)',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 12,
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 600,
        },
      },
    },
  },
});
