import "./style.css";
export const metadata = {
  title: "LAN Control Manager",
  description: "Gerenciamento seguro da sua LAN house",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
