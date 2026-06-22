import { Box } from "@chakra-ui/react";
import "./globals.css";
import ParaWalletProvider from "./providers/ParaWallet";
import ChakraUIProvider from "./providers/ChakraUI";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body>
        <ChakraUIProvider>
          <ParaWalletProvider>
            <Box m={0} minH="100vh" bg="bg.subtle">
              {children}
            </Box>
          </ParaWalletProvider>
        </ChakraUIProvider>
      </body>
    </html>
  );
}
