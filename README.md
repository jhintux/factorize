# Factorize

Factorize is a RWA protocol that allow investors to receive up to 18% for receivables of SME (small medium enterprises).

The APY comes from the discount of their receivables at what they sell because of the need of immediate liquidity.

Use cases 

## 4.1 User Story 1 — SME Tokenizes Invoice

```mermaid
sequenceDiagram


  actor SME


  participant FactoringProgram


  participant InvoicePoolPDA
Note right of InvoicePoolPDA: Store: <br/> invoice_id <br/> invoice_amount <br/> due_date <br/> funding_target <br/> status=Funding


SME->>FactoringProgram: init_invoice_vault()


FactoringProgram->>InvoicePoolPDA: initialize


FactoringProgram-->>SME: Invoice Created
```

## 4.2 User Story 2 — Risk Analyst Publishes Assessment

```mermaid
sequenceDiagram

actor Analyst

participant FactoringProgram

participant InvoicePoolPDA

Analyst->>FactoringProgram: assess_invoice_risk()

FactoringProgram->>InvoicePoolPDA: link assessment hash

Note right of RiskAssessmentPDA: risk_grade <br/> yield <br/> advance_rate <br/> timestamp

FactoringProgram-->>Analyst: Assessment Published
```

## 4.3 User Story 3 — Investor Funds Invoice

```mermaid
sequenceDiagram


actor Investor


participant InvestorUSDC


participant FactoringProgram


participant InvoicePoolPDA


participant EscrowVaultPDA


participant PositionPDA


Investor->>FactoringProgram: fund_invoice(amount)


FactoringProgram->>EscrowVaultPDA: transfer USDC


FactoringProgram->>PositionPDA: create/update


FactoringProgram->>InvoicePoolPDA: funded += amount


alt funding target reached


FactoringProgram->>InvoicePoolPDA: status = FullyFunded


end


FactoringProgram-->>Investor: Position Created
```

## 4.4 User Story 4 — Settlement & Yield Distribution

```mermaid
sequenceDiagram


actor Admin


participant FactoringProgram


participant InvoicePoolPDA


participant EscrowVaultPDA


participant RepaymentRecordPDA


actor Investor


Admin->>FactoringProgram: record_repayment()


FactoringProgram->>RepaymentRecordPDA: create settlement record


FactoringProgram->>InvoicePoolPDA: status = Settled


loop For each investor


FactoringProgram->>Investor: principal + yield


end
```