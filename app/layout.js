import "./globals.css";

export const metadata = {
  title: "Pulse — Origination Intelligence",
  description: "Painel operacional do Pulse para captura, enriquecimento e sincronização de inteligência comercial.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#07111f",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
