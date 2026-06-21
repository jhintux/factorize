"use client";

import { useCallback, useState } from "react";
import { Flex, IconButton, Link, Text, type TextProps } from "@chakra-ui/react";

function explorerUrl(value: string, kind: "address" | "tx") {
  const segment = kind === "tx" ? "tx" : "address";
  return `https://explorer.solana.com/${segment}/${value}?cluster=devnet`;
}

function truncateAddress(value: string, chars: number) {
  if (value.length <= chars * 2 + 1) return value;
  return `${value.slice(0, chars)}…${value.slice(-chars)}`;
}

function CopyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

type CopyableAddressProps = TextProps & {
  address: string | null | undefined;
  prefix?: string;
  truncateChars?: number;
  emptyLabel?: string;
  kind?: "address" | "tx";
};

export function CopyableAddress({
  address,
  prefix = "",
  truncateChars,
  emptyLabel = "—",
  kind = "address",
  ...textProps
}: CopyableAddressProps) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard failures
    }
  }, [address]);

  if (!address) {
    return (
      <Text fontFamily="mono" {...textProps}>
        {emptyLabel}
      </Text>
    );
  }

  const display =
    truncateChars !== undefined ? truncateAddress(address, truncateChars) : address;

  const copyLabel = kind === "tx" ? "transaction signature" : "address";

  return (
    <Flex align="center" gap={1} minW={0} w="fit-content" maxW="100%">
      <Link
        href={explorerUrl(address, kind)}
        target="_blank"
        rel="noopener noreferrer"
        minW={0}
        _hover={{ textDecoration: "underline" }}
      >
        <Text
          fontFamily="mono"
          wordBreak="break-all"
          title={address}
          minW={0}
          {...textProps}
        >
          {prefix}
          {display}
        </Text>
      </Link>
      <IconButton
        aria-label={copied ? "Copied" : `Copy ${copyLabel}`}
        size="2xs"
        variant="ghost"
        colorPalette={copied ? "green" : "gray"}
        flexShrink={0}
        onClick={() => void copy()}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </IconButton>
    </Flex>
  );
}
