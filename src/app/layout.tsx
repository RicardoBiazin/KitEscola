import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KitEscola — material escolar pelo menor preço",
  description: "Informe a lista de material escolar e o KitEscola encontra os menores preços com frete para o seu CEP.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
