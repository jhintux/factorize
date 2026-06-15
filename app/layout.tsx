import ParaWalletProvider from "./providers/ParaWallet";
import ChakraUIProvider from "./providers/ChakraUI";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#fafafa" }}>
        <ParaWalletProvider>
          <ChakraUIProvider>{children}</ChakraUIProvider>
        </ParaWalletProvider>
      </body>
    </html>
  );
}
