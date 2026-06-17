# Factorize

Factorize is an RWA protocol that lets investors earn yield on receivables from SMEs (small and medium enterprises).

The APY comes from the discount at which SMEs sell their receivables when they need immediate liquidity.

## On-chain accounts

| Account | PDA seeds | Description |
|---------|-----------|-------------|
| `Config` | `["config"]` | Protocol admin, treasury, USDC mint, protocol fee, and pause flag |
| `AnalystWhitelist` | `["analyst", analyst_pubkey]` | Marks a risk analyst as authorized to assess invoices |
| `InvoiceVault` | `["invoice_vault", sme, invoice_id]` | Per-invoice state: amounts, dates, status, analyst attestation |
| `shares` mint | `["shares", sme, invoice_id]` | SPL token representing each investor's position (1 share = 1 USDC funded) |
| `invoice_vault_ata` | ATA of `InvoiceVault` | USDC escrow for investor deposits, SME advance, and settlement payouts |

### `InvoiceVault` fields

- `advance_amount` — target funding (typically 80–95% of face value)
- `funding_amount` — USDC deposited by investors so far
- `repayment_amount` — full receivable value when the debtor pays
- `settled_share_supply` / `settlement_pool` / `claimed_amount` — used after settlement for proportional investor claims
- `due_date` — end of the funding window
- `settle_date` — deadline for debtor repayment
- `invoice_hash` / `analyst` / `verified_at` — risk assessment attestation

### `InvoiceStatus` lifecycle

```mermaid
stateDiagram-v2
    [*] --> Funding: init_invoice_vault
    Funding --> InProgress: funding_amount >= advance_amount
    Funding --> Expired: past due_date and underfunded
    InProgress --> Settled: settle_invoice
    InProgress --> Defaulted: past settle_date
    Expired --> [*]: claim_investment (refund)
    Settled --> [*]: claim_investment (payout)
    Defaulted --> [*]
```

Status transitions on `Funding` and `InProgress` are also applied automatically by `sync_invoice_status` (and by any instruction that touches the vault).

## Instructions

### Protocol setup (admin)

| Instruction | Signer | Description |
|-------------|--------|-------------|
| `init_config` | admin | One-time setup: treasury, USDC mint, protocol fee (bps), and pause flag |
| `add_analyst` | admin | Whitelist a risk analyst (`AnalystWhitelist` PDA) |
| `remove_analyst` | admin | Close an analyst's whitelist account |
| `set_paused` | admin | Pause or unpause the protocol |

### Invoice lifecycle

| Instruction | Signer | Required status | Description |
|-------------|--------|-----------------|-------------|
| `init_invoice_vault` | SME | — | Create an `InvoiceVault`, `shares` mint, and USDC escrow ATA |
| `assess_invoice_risk` | whitelisted analyst | `Funding` | Attach `invoice_hash` attestation; sets `analyst` and `verified_at` |
| `fund_invoice` | investor | `Funding` (assessed) | Transfer USDC into the vault; mint `shares` 1:1; moves to `InProgress` when fully funded |
| `claim_invoice` | SME | `InProgress` | SME withdraws the funded USDC advance from the vault |
| `settle_invoice` | SME | `InProgress` | SME repays into the vault; protocol fee sent to treasury; status → `Settled` |
| `claim_investment` | investor | `Funding`, `Expired`, or `Settled` | Burn `shares` and receive USDC (refund if expired/underfunded, proportional payout if settled) |
| `sync_invoice_status` | anyone | — | Permissionless keeper hook for `due_date` / `settle_date` transitions |

## User stories

### SME tokenizes an invoice

```mermaid
sequenceDiagram
    actor SME
    participant Factorize
    participant InvoiceVault
    participant SharesMint
    participant VaultATA

    SME->>Factorize: init_invoice_vault(props)
    Factorize->>InvoiceVault: initialize (status = Funding)
    Factorize->>SharesMint: create shares mint
    Factorize->>VaultATA: create USDC escrow ATA
    Factorize-->>SME: invoice vault created
```

### Risk analyst publishes assessment

```mermaid
sequenceDiagram
    actor Analyst
    participant Factorize
    participant AnalystWhitelist
    participant InvoiceVault

    Analyst->>Factorize: assess_invoice_risk(invoice_id, invoice_hash)
    Factorize->>AnalystWhitelist: verify analyst is whitelisted
    Factorize->>InvoiceVault: set invoice_hash, analyst, verified_at
    Factorize-->>Analyst: assessment published
```

### Investor funds an invoice

```mermaid
sequenceDiagram
    actor Investor
    participant Factorize
    participant InvoiceVault
    participant VaultATA
    participant SharesMint

    Investor->>Factorize: fund_invoice(invoice_id, amount)
    Factorize->>VaultATA: transfer USDC from investor
    Factorize->>SharesMint: mint shares to investor (1:1)
    Factorize->>InvoiceVault: funding_amount += amount

    alt advance_amount reached
        Factorize->>InvoiceVault: status = InProgress
    end

    Factorize-->>Investor: shares minted
```

### SME claims advance and settles

```mermaid
sequenceDiagram
    actor SME
    participant Factorize
    participant InvoiceVault
    participant VaultATA
    participant Treasury

    SME->>Factorize: claim_invoice(invoice_id)
    Factorize->>VaultATA: transfer USDC advance to SME

    Note over SME: debtor pays receivable off-chain

    SME->>Factorize: settle_invoice(invoice_id, repayment_amount)
    Factorize->>VaultATA: transfer investor pool from SME
    Factorize->>Treasury: transfer protocol fee on profit
    Factorize->>InvoiceVault: status = Settled, record settlement_pool
```

### Investors claim returns

```mermaid
sequenceDiagram
    actor Investor
    participant Factorize
    participant InvoiceVault
    participant VaultATA
    participant SharesMint

    Investor->>Factorize: claim_investment(invoice_id, shares)
    Factorize->>SharesMint: burn investor shares
    Factorize->>VaultATA: transfer USDC (proportional payout or refund)
    Factorize->>InvoiceVault: update claimed_amount
    Factorize-->>Investor: USDC received
```
