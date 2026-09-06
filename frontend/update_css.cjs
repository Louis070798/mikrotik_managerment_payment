const fs = require('fs');
let css = fs.readFileSync('src/index.css', 'utf8');

// Replace hardcoded #fff with var(--text-main) where appropriate, or a new var(--text-heading)
css = css.replace(/color: #fff;/g, 'color: var(--text-heading);');
css = css.replace(/color: white;/g, 'color: #fff;'); // buttons generally stay white text

// Add light theme vars
const lightTheme = `
[data-theme="light"] {
  --bg-color: #f1f5f9;
  --panel-bg: rgba(255, 255, 255, 0.9);
  --text-main: #334155;
  --text-heading: #0f172a;
  --text-muted: #64748b;
  --primary: #2563eb;
  --primary-hover: #1d4ed8;
  --danger: #ef4444;
  --success: #10b981;
  --warning: #f59e0b;
  --border: rgba(0, 0, 0, 0.1);
  --glass-border: rgba(0, 0, 0, 0.08);
  --sidebar-bg: rgba(255, 255, 255, 0.95);
  color-scheme: light;
}

[data-theme="light"] body {
  background-image: 
    radial-gradient(at 0% 0%, rgba(37, 99, 235, 0.08) 0px, transparent 50%),
    radial-gradient(at 100% 100%, rgba(16, 185, 129, 0.05) 0px, transparent 50%);
}
`;

// Add new generic variables to :root
css = css.replace(
    /:root \{/,
    ':root {\n  --text-heading: #fff;\n  --sidebar-bg: rgba(15, 23, 42, 0.8);'
);

// Fix sidebar bg
css = css.replace(/background: rgba\(15, 23, 42, 0\.8\);/, 'background: var(--sidebar-bg);');

// Add light theme after root
css = css.replace(/}\s*body {/, '}\n' + lightTheme + '\nbody {');

fs.writeFileSync('src/index.css', css);
