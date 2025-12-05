/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
        "./components/**/*.{js,ts,jsx,tsx}",
        "./hooks/**/*.{js,ts,jsx,tsx}",
        "./services/**/*.{js,ts,jsx,tsx}",
        "./*.{js,ts,jsx,tsx}"
    ],
    theme: {
        extend: {
            fontFamily: {
                'sans': ['Inter', 'system-ui', 'sans-serif'],
                'display': ['Orbitron', 'sans-serif'],
            },
            colors: {
                'tactical': {
                    900: 'hsl(222 47% 11%)',
                    800: 'hsl(217 33% 17%)',
                    700: 'hsl(215 25% 27%)',
                    600: 'hsl(215 20% 40%)',
                },
                'accent': {
                    cyan: 'hsl(187 100% 42%)',
                    blue: 'hsl(217 91% 60%)',
                    gold: 'hsl(45 93% 47%)',
                },
            },
            animation: {
                'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
                'shimmer': 'shimmer 2s infinite',
                'slide-up': 'slide-up 0.4s ease-out',
                'slide-in-right': 'slide-in-right 0.3s ease-out',
                'float': 'float 3s ease-in-out infinite',
                'border-glow': 'border-glow 3s ease-in-out infinite',
                'pulse-ring': 'pulse-ring 2s ease-in-out infinite',
            },
            backdropBlur: {
                'xs': '2px',
            },
            boxShadow: {
                'glow-cyan': '0 0 20px rgba(6, 182, 212, 0.4)',
                'glow-gold': '0 0 20px rgba(251, 191, 36, 0.4)',
                'glow-blue': '0 0 20px rgba(59, 130, 246, 0.4)',
            },
        },
    },
    plugins: [],
}
