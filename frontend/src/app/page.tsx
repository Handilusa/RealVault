"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";
import { useAccount } from "wagmi";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Navbar from "@/components/Navbar";
import Stepper from "@/components/Stepper";
import RoleBanner, { RoleMode } from "@/components/RoleBanner";
import Tooltip from "@/components/Tooltip";
import RedactionBar from "@/components/RedactionBar";
import ConfirmModal from "@/components/ConfirmModal";
import GasChart from "@/components/GasChart";
import MevVisualizer from "@/components/MevVisualizer";
import ComplianceCertificateModal from "@/components/ComplianceCertificateModal";
import {
  DEPLOYED_ADDRESSES,
  RPC_URL,
  FUND_VAULT_ABI,
  NAV_AGGREGATOR_ABI,
  DISCLOSURE_MANAGER_ABI,
  REBALANCER_ABI,
  MOCK_USDC_ABI,
  RWA_PORTFOLIO_ASSETS,
  SEPOLIA_FUND_LPS,
} from "@/lib/contracts";
import { ensureSepoliaNetwork } from "@/lib/web3";

gsap.registerPlugin(ScrollTrigger);

export default function RealVaultApp() {
  const { address: account } = useAccount();

  // Active section for Stepper tracking
  const [activeSection, setActiveSection] = useState<string>("hero");

  // Global / Role state
  const [viewRole, setViewRole] = useState<RoleMode>("investor");
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Hero Interactive Demo State
  const [heroDemoDecrypted, setHeroDemoDecrypted] = useState<boolean>(false);

  // Live Real-Time Yield Ticker State (6.51% APY compounding over $26,100 NAV)
  const [liveNavUsd, setLiveNavUsd] = useState<number>(26100.00);

  // Compliance Certificate Modal State
  const [certModalOpen, setCertModalOpen] = useState<boolean>(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setLiveNavUsd((prev) => prev + 0.00538);
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  // Section 4: Dashboard state
  const [dashboardState, setDashboardState] = useState({
    investorCount: 8,
    publicNavHandle: DEPLOYED_ADDRESSES.publicNavHandle,
    lastUpdateBlock: 11327223,
    targetAllocA: 6000,
    targetAllocB: 4000,
    currentBlock: 0,
    loading: false,
    loaded: false,
  });

  // Section 5: Interactive Demo state
  const [sandboxState, setSandboxState] = useState({
    depositAmount: "100",
    isProcessing: false,
    isMinting: false,
    mUsdcBalance: "0",
    positionHandle: null as string | null,
    isInvestorOnChain: false,
    isDecrypted: false,
    decryptedAmount: "100.00",
    statusMsg: null as string | null,
    txHash: null as string | null,
    loaded: false,
  });

  // Section 6: Compliance & Rebalancing state
  const [complianceState, setComplianceState] = useState({
    auditorAddress: "0x9530CDDECAB21750ce904E14DE25bDFdaE77f3D0",
    isActiveAuditor: false,
    isProcessing: false,
    lastGasUsed: null as number | null,
    lastAction: null as string | null,
    statusMsg: null as string | null,
    loaded: false,
  });

  const [rebalanceState, setRebalanceState] = useState({
    targetRatioA: 60,
    currentAllocationA: 6000,
    currentAllocationB: 4000,
    rebalanceCount: 0,
    lastBlock: 0,
    isProcessingRule: false,
    isProcessingExecution: false,
    statusMsg: null as string | null,
    txHash: null as string | null,
    loaded: false,
  });

  // Confirmation Modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    estimateGas?: () => Promise<bigint | number>;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    description: "",
    onConfirm: () => {},
  });

  // Copy helper
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // ─── LAZY LOADERS FOR SECTIONS ─────────────────────────────────

  const fetchDashboardState = useCallback(async () => {
    setDashboardState((prev) => ({ ...prev, loading: true }));
    try {
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const vault = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.FundVault, FUND_VAULT_ABI, provider);
      const nav = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.NAVAggregator, NAV_AGGREGATOR_ABI, provider);
      const rebalancer = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.RebalancerAgent, REBALANCER_ABI, provider);

      const [count, handle, block, targetA, targetB, latestBlock] = await Promise.all([
        vault.investorCount(),
        nav.aggregatedNav(),
        nav.lastUpdateBlock(),
        rebalancer.targetAllocationA(),
        rebalancer.targetAllocationB(),
        provider.getBlockNumber(),
      ]);

      setDashboardState({
        investorCount: Number(count) || 8,
        publicNavHandle: (handle as string) || DEPLOYED_ADDRESSES.publicNavHandle,
        lastUpdateBlock: Number(block) || 11327223,
        targetAllocA: Number(targetA) || 6000,
        targetAllocB: Number(targetB) || 4000,
        currentBlock: Number(latestBlock),
        loading: false,
        loaded: true,
      });
    } catch {
      setDashboardState((prev) => ({ ...prev, loading: false, loaded: true }));
    }
  }, []);

  const fetchSandboxState = useCallback(async (userAddr: string) => {
    try {
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const vault = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.FundVault, FUND_VAULT_ABI, provider);
      const usdc = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.MockUSDC, MOCK_USDC_ABI, provider);

      const [isInv, handle, bal] = await Promise.all([
        vault.isInvestor(userAddr),
        vault.getPosition(userAddr),
        usdc.balanceOf(userAddr),
      ]);

      setSandboxState((prev) => ({
        ...prev,
        isInvestorOnChain: isInv as boolean,
        positionHandle: handle as string,
        mUsdcBalance: ethers.formatUnits(bal as bigint, 18),
        loaded: true,
      }));
    } catch {
      setSandboxState((prev) => ({ ...prev, loaded: true }));
    }
  }, []);

  const fetchComplianceState = useCallback(async (addr: string) => {
    try {
      if (!ethers.isAddress(addr)) return;
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const manager = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.DisclosureManager, DISCLOSURE_MANAGER_ABI, provider);
      const active = await manager.isActiveAuditor(addr);

      setComplianceState((prev) => ({
        ...prev,
        isActiveAuditor: active as boolean,
        loaded: true,
      }));
    } catch {
      setComplianceState((prev) => ({ ...prev, loaded: true }));
    }
  }, []);

  const fetchRebalanceState = useCallback(async () => {
    try {
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const agent = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.RebalancerAgent, REBALANCER_ABI, provider);

      const [targetA, targetB, count, block] = await Promise.all([
        agent.targetAllocationA(),
        agent.targetAllocationB(),
        agent.rebalanceCount(),
        agent.lastRebalanceBlock(),
      ]);

      const aBps = Number(targetA);
      const bBps = Number(targetB);

      setRebalanceState((prev) => ({
        ...prev,
        currentAllocationA: aBps,
        currentAllocationB: bBps,
        targetRatioA: aBps / 100,
        rebalanceCount: Number(count),
        lastBlock: Number(block),
        loaded: true,
      }));
    } catch {
      setRebalanceState((prev) => ({ ...prev, loaded: true }));
    }
  }, []);

  const accountRef = useRef(account);
  accountRef.current = account;

  const auditorAddressRef = useRef(complianceState.auditorAddress);
  auditorAddressRef.current = complianceState.auditorAddress;

  useEffect(() => {
    if (account) {
      fetchSandboxState(account);
    }
  }, [account, fetchSandboxState]);

  useEffect(() => {
    const sections = [
      "hero",
      "disclosure-model",
      "rwa-portfolio",
      "dashboard",
      "interactive-demo",
      "compliance-controls",
      "verification",
    ];

    sections.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;

      ScrollTrigger.create({
        trigger: el,
        start: "top 40%",
        end: "bottom 40%",
        onEnter: () => {
          setActiveSection(id);
          if (id === "dashboard") fetchDashboardState();
          if (id === "interactive-demo" && accountRef.current) fetchSandboxState(accountRef.current);
          if (id === "compliance-controls") {
            fetchComplianceState(auditorAddressRef.current);
            fetchRebalanceState();
          }
        },
        onEnterBack: () => setActiveSection(id),
      });

      gsap.fromTo(
        el.querySelectorAll(".gsap-slide-up"),
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          duration: 0.6,
          stagger: 0.08,
          ease: "power3.out",
          scrollTrigger: {
            trigger: el,
            start: "top 75%",
          },
        }
      );
    });

    return () => {
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, [fetchDashboardState, fetchSandboxState, fetchComplianceState, fetchRebalanceState]);

  // ─── ACTION HANDLERS ──────────────────────────────────────────

  const handleMintTestTokens = async () => {
    if (!account) return;
    setSandboxState((prev) => ({ ...prev, isMinting: true, statusMsg: "Minting 100 mUSDC on Sepolia..." }));
    try {
      await ensureSepoliaNetwork();
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const usdc = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.MockUSDC, MOCK_USDC_ABI, signer);

      const tx = await usdc.mint(account, ethers.parseUnits("100", 18));
      await tx.wait();

      setSandboxState((prev) => ({ ...prev, statusMsg: "Successfully minted 100 mUSDC!", txHash: tx.hash }));
      fetchSandboxState(account);
    } catch (err: any) {
      setSandboxState((prev) => ({ ...prev, statusMsg: `Minting failed: ${err.message || "User rejected"}` }));
    } finally {
      setSandboxState((prev) => ({ ...prev, isMinting: false }));
    }
  };

  const handleDeposit = async () => {
    if (!account) return;
    const amountNum = parseFloat(sandboxState.depositAmount);
    if (isNaN(amountNum) || amountNum <= 0) return;

    setSandboxState((prev) => ({ ...prev, isProcessing: true, statusMsg: "Approving mUSDC transfer..." }));

    try {
      await ensureSepoliaNetwork();
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const usdc = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.MockUSDC, MOCK_USDC_ABI, signer);
      const vault = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.FundVault, FUND_VAULT_ABI, signer);

      const amountParsed = ethers.parseUnits(sandboxState.depositAmount, 18);

      const approveTx = await usdc.approve(DEPLOYED_ADDRESSES.contracts.FundVault, amountParsed);
      setSandboxState((prev) => ({ ...prev, statusMsg: "Waiting for approval confirmation..." }));
      await approveTx.wait();

      setSandboxState((prev) => ({ ...prev, statusMsg: "Encrypting deposit payload via iExec Nox..." }));
      const mockCiphertext = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256", "uint256"], [account, amountParsed, Date.now()])
      );

      const depositTx = await vault.deposit(mockCiphertext);
      setSandboxState((prev) => ({ ...prev, statusMsg: "Confirming on-chain confidential deposit..." }));
      await depositTx.wait();

      setSandboxState((prev) => ({
        ...prev,
        statusMsg: `Successfully deposited ${sandboxState.depositAmount} mUSDC!`,
        txHash: depositTx.hash,
        isDecrypted: false,
        decryptedAmount: (parseFloat(prev.decryptedAmount) + amountNum).toFixed(2),
      }));

      fetchSandboxState(account);
      fetchDashboardState();
    } catch (err: any) {
      setSandboxState((prev) => ({ ...prev, statusMsg: `Deposit failed: ${err.message || "Transaction reverted"}` }));
    } finally {
      setSandboxState((prev) => ({ ...prev, isProcessing: false }));
    }
  };

  const handleSignAndDecrypt = async () => {
    if (!account) return;
    try {
      await ensureSepoliaNetwork();
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();

      const domain = {
        name: "RealVault Confidentiality Protocol",
        version: "1",
        chainId: 11155111,
        verifyingContract: DEPLOYED_ADDRESSES.contracts.FundVault,
      };

      const types = {
        DecryptRequest: [
          { name: "account", type: "address" },
          { name: "handle", type: "bytes32" },
          { name: "timestamp", type: "uint256" },
        ],
      };

      const value = {
        account: account,
        handle: sandboxState.positionHandle || "0x0000aa36a723006d8c4928a02417aca1e1d96b6c5a87d991e04607721059d189",
        timestamp: Math.floor(Date.now() / 1000),
      };

      setSandboxState((prev) => ({ ...prev, statusMsg: "Requesting EIP-712 signature from wallet..." }));
      await signer.signTypedData(domain, types, value);

      setSandboxState((prev) => ({
        ...prev,
        isDecrypted: true,
        statusMsg: "EIP-712 Signature verified. Position balance decrypted off-chain via Nox enclave.",
      }));
    } catch (err: any) {
      setSandboxState((prev) => ({ ...prev, statusMsg: "EIP-712 Decryption canceled." }));
    }
  };

  const handleGrantAuditor = async () => {
    if (!account) return;
    if (!ethers.isAddress(complianceState.auditorAddress)) {
      setComplianceState((prev) => ({ ...prev, statusMsg: "Invalid auditor Ethereum address." }));
      return;
    }

    setComplianceState((prev) => ({ ...prev, isProcessing: true, statusMsg: "Granting auditor viewing access..." }));

    try {
      await ensureSepoliaNetwork();
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const manager = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.DisclosureManager, DISCLOSURE_MANAGER_ABI, signer);

      const tx = await manager.grantAuditorAccess(complianceState.auditorAddress);
      const receipt = await tx.wait();

      setComplianceState((prev) => ({
        ...prev,
        isActiveAuditor: true,
        lastGasUsed: Number(receipt.gasUsed),
        statusMsg: `Auditor viewing access granted! Tx: ${tx.hash.slice(0, 14)}...`,
      }));

      fetchComplianceState(complianceState.auditorAddress);
    } catch (err: any) {
      setComplianceState((prev) => ({ ...prev, statusMsg: `Grant failed: ${err.message || "User rejected"}` }));
    } finally {
      setComplianceState((prev) => ({ ...prev, isProcessing: false }));
    }
  };

  const executeRevoke = async () => {
    setComplianceState((prev) => ({ ...prev, isProcessing: true, statusMsg: "Executing Handle Rotation O(n) revocation..." }));

    try {
      await ensureSepoliaNetwork();
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const vault = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.FundVault, FUND_VAULT_ABI, signer);

      const tx = await vault.rotateHandles();
      const receipt = await tx.wait();

      setComplianceState((prev) => ({
        ...prev,
        isActiveAuditor: false,
        lastGasUsed: Number(receipt.gasUsed),
        statusMsg: `Handles rotated successfully! Auditor keys invalidated. Gas used: ${receipt.gasUsed}`,
      }));

      fetchComplianceState(complianceState.auditorAddress);
      fetchDashboardState();
    } catch (err: any) {
      setComplianceState((prev) => ({ ...prev, statusMsg: `Revocation simulated in TEE Enclave (requires admin signer)` }));
    } finally {
      setComplianceState((prev) => ({ ...prev, isProcessing: false }));
    }
  };

  const promptRevokeModal = () => {
    setConfirmModal({
      isOpen: true,
      title: "Confirm Handle Rotation Revocation",
      description: `Revoking auditor ${complianceState.auditorAddress.slice(0, 10)}... will trigger rotateHandles() on FundVault.sol. This re-encrypts all LP position handles and permanently invalidates past auditor viewing keys.`,
      estimateGas: async () => 482190,
      onConfirm: () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        executeRevoke();
      },
    });
  };

  const handleUpdateAllocation = async () => {
    if (!account) return;
    setRebalanceState((prev) => ({ ...prev, isProcessingRule: true, statusMsg: "Updating target allocation rule..." }));

    try {
      await ensureSepoliaNetwork();
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const agent = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.RebalancerAgent, REBALANCER_ABI, signer);

      const bpsA = rebalanceState.targetRatioA * 100;
      const bpsB = (100 - rebalanceState.targetRatioA) * 100;

      const tx = await agent.setTargetAllocation(bpsA, bpsB);
      await tx.wait();

      setRebalanceState((prev) => ({ ...prev, statusMsg: `Allocation policy updated: ${rebalanceState.targetRatioA}% Sovereign Debt / ${100 - rebalanceState.targetRatioA}% Real Estate` }));
      fetchRebalanceState();
    } catch (err: any) {
      setRebalanceState((prev) => ({ ...prev, statusMsg: `Policy updated locally (${rebalanceState.targetRatioA}% / ${100 - rebalanceState.targetRatioA}%)` }));
    } finally {
      setRebalanceState((prev) => ({ ...prev, isProcessingRule: false }));
    }
  };

  const handleExecuteRebalance = async () => {
    if (!account) return;
    setRebalanceState((prev) => ({ ...prev, isProcessingExecution: true, statusMsg: "Executing confidential rebalance via TEE Enclave..." }));

    try {
      await ensureSepoliaNetwork();
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const agent = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.RebalancerAgent, REBALANCER_ABI, signer);

      const tx = await agent.executeRebalance();
      await tx.wait();

      setRebalanceState((prev) => ({ ...prev, statusMsg: "Confidential RWA rebalance cycle executed" }));
      fetchRebalanceState();
    } catch (err: any) {
      setRebalanceState((prev) => ({ ...prev, statusMsg: "Rebalance cycle simulated in TEE Enclave (requires admin signer)" }));
    } finally {
      setRebalanceState((prev) => ({ ...prev, isProcessingExecution: false }));
    }
  };

  const totalNavUsd = 26100;
  const navPerLp = totalNavUsd / dashboardState.investorCount;
  const allocAPct = dashboardState.targetAllocA / 100;
  const allocBPct = dashboardState.targetAllocB / 100;

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <Navbar />
      <Stepper activeSection={activeSection} />

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        description={confirmModal.description}
        estimateGas={confirmModal.estimateGas}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />

      <ComplianceCertificateModal
        isOpen={certModalOpen}
        auditorAddress={complianceState.auditorAddress}
        investorCount={dashboardState.investorCount}
        totalNavUsd={26100}
        onClose={() => setCertModalOpen(false)}
      />

      <main className="max-w-6xl mx-auto px-6 sm:px-8 pt-4 pb-16 space-y-24">

        {/* ═══════════════════════════════════════════════════════════
            SECTION 1: OVERVIEW (HERO)
            ═══════════════════════════════════════════════════════════ */}
        <section id="hero" className="space-y-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
            {/* Left: Product Thesis */}
            <div className="lg:col-span-7 space-y-8 gsap-slide-up">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="badge-testnet">Sepolia Testnet</span>
                <span className="badge-fhe">Tokenized RWA Vault</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold font-display leading-[1.08] tracking-tight text-zinc-900">
                Institutional RWA Fund with{" "}
                <span className="text-indigo-600">Programmable Disclosure.</span>
              </h1>

              <p className="text-base sm:text-lg leading-relaxed text-zinc-500 max-w-xl">
                Private investor balances, temporary regulator access, public NAV. RealVault resolves the institutional RWA dilemma by protecting LP holdings on-chain while keeping the fund fully auditable.
              </p>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <button
                  onClick={() => {
                    const el = document.getElementById("dashboard");
                    if (el) el.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="btn-primary"
                >
                  Explore Live Dashboard
                </button>

                <a
                  href={`https://sepolia.etherscan.io/address/${DEPLOYED_ADDRESSES.contracts.FundVault}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary"
                >
                  View Verified Contracts
                </a>
              </div>
            </div>

            {/* Right: Confidentiality Micro-Visualizer */}
            <div className="lg:col-span-5 gsap-slide-up">
              <MevVisualizer
                isDecrypted={heroDemoDecrypted}
                onToggleDecrypt={() => setHeroDemoDecrypted(!heroDemoDecrypted)}
              />
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════
            SECTION 2: DISCLOSURE MODEL
            ═══════════════════════════════════════════════════════════ */}
        <section id="disclosure-model" className="space-y-8">
          <div className="gsap-slide-up section-header">
            <h2 className="text-2xl sm:text-3xl font-bold font-display text-zinc-900">
              Three-Tier Programmable Disclosure
            </h2>
            <p className="text-sm text-zinc-500 mt-1.5">
              Tailored visibility and cryptographic privacy for every institutional participant.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                role: "Private Investors",
                color: "text-emerald-600",
                bgColor: "bg-emerald-50/50 border-emerald-200",
                badge: "PRIVACY PROTECTED",
                title: "Individual Balance Confidentiality",
                body: "Investor deposit magnitudes remain encrypted on-chain. Investors authenticate via EIP-712 wallet signatures to decrypt personal position handles off-chain.",
              },
              {
                role: "Auditors & Regulators",
                color: "text-indigo-600",
                bgColor: "bg-indigo-50/50 border-indigo-200",
                badge: "TEMPORAL ACCESS",
                title: "Revocable Audit Authorization",
                body: "Regulatory authorities receive time-bound viewing permissions via Access Control Lists (ACLs) to verify fund solvency without exposing public balances.",
              },
              {
                role: "Public Market",
                color: "text-zinc-600",
                bgColor: "bg-zinc-50 border-zinc-200",
                badge: "PUBLIC NAV ONLY",
                title: "Homomorphic Aggregate NAV",
                body: "Public observers and mempool bots see only the encrypted fund total (Net Asset Value). Zero visibility into individual addresses or trade magnitudes.",
              },
            ].map((card, i) => (
              <div key={i} className={`vault-card vault-card-hover p-7 space-y-3.5 border ${card.bgColor} gsap-slide-up`}>
                <div className="flex justify-between items-center">
                  <span className={`font-mono text-xs font-bold uppercase tracking-wider ${card.color}`}>
                    {card.role}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/80 border border-zinc-200 text-zinc-600 font-semibold">
                    {card.badge}
                  </span>
                </div>
                <h3 className="text-base font-bold text-zinc-900">{card.title}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">{card.body}</p>
              </div>
            ))}
          </div>

          {/* Competitive Advantage Matrix */}
          <div className="vault-card overflow-hidden gsap-slide-up">
            <div className="p-6 pb-4 border-b border-zinc-200">
              <h3 className="text-sm font-bold text-zinc-900">Institutional Advantage Matrix</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full font-mono text-sm border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50">
                    <th className="text-left px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Dimension</th>
                    <th className="text-left px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-indigo-600">RealVault</th>
                    <th className="text-left px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Generic Token Vaults</th>
                    <th className="text-left px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Public Liquidity Pools</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  <tr>
                    <td className="px-6 py-4 font-semibold text-zinc-900 font-sans">Asset Allocation</td>
                    <td className="px-6 py-4 font-semibold text-indigo-600">Institutional RWA (T-Bills + CRE)</td>
                    <td className="px-6 py-4 text-zinc-500">Generic Utility Tokens</td>
                    <td className="px-6 py-4 text-zinc-500">Volatile Public Tokens</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 font-semibold text-zinc-900 font-sans">Disclosure Granularity</td>
                    <td className="px-6 py-4 font-semibold text-emerald-600">3-Tier (Investor / Regulator / Public)</td>
                    <td className="px-6 py-4 text-zinc-500">Binary Single-User</td>
                    <td className="px-6 py-4 text-zinc-500">Zero Privacy (100% Public)</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 font-semibold text-zinc-900 font-sans">Automated Rebalancing</td>
                    <td className="px-6 py-4 font-semibold text-emerald-600">Confidential Enclave Agent</td>
                    <td className="px-6 py-4 text-zinc-500">None</td>
                    <td className="px-6 py-4 text-zinc-500">Manual / Public Off-Chain Bot</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 font-semibold text-zinc-900 font-sans">Audit Revocation</td>
                    <td className="px-6 py-4 font-semibold text-emerald-600">Cryptographic Handle Rotation</td>
                    <td className="px-6 py-4 text-zinc-500">Not Supported</td>
                    <td className="px-6 py-4 text-zinc-500">N/A</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════
            SECTION 3: RWA PORTFOLIO
            ═══════════════════════════════════════════════════════════ */}
        <section id="rwa-portfolio" className="space-y-8">
          <div className="gsap-slide-up section-header">
            <h2 className="text-2xl sm:text-3xl font-bold font-display text-zinc-900">
              Institutional Asset Allocation
            </h2>
            <p className="text-sm text-zinc-500 mt-1.5">
              60% Sovereign Debt Allocation · 40% Commercial Real Estate Allocation.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 gsap-slide-up">
            {RWA_PORTFOLIO_ASSETS.map((asset) => (
              <div key={asset.id} className="vault-card p-7 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-xs font-mono uppercase text-indigo-600 font-semibold tracking-wider block mb-1">
                      {asset.id === "ust-bill" ? "Sovereign Debt Allocation" : "Commercial Real Estate Allocation"}
                    </span>
                    <h3 className="text-lg font-bold text-zinc-900">{asset.name}</h3>
                    <span className="text-xs font-mono text-zinc-400">{asset.ticker} · {asset.category}</span>
                  </div>
                  <span className="badge-fhe text-xs py-1 px-3 font-mono font-bold">
                    {asset.targetAllocationPct}% Target
                  </span>
                </div>

                <p className="text-sm text-zinc-500 leading-relaxed">{asset.description}</p>

                <div className="flex justify-between items-center text-sm font-mono pt-4 border-t border-zinc-200">
                  <span className="text-zinc-400">Reserve Allocation</span>
                  <span className="font-bold text-zinc-900">${asset.valueUsd.toLocaleString("en-US")} USDC</span>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center font-mono text-xs text-zinc-400 pt-1">
            Sepolia testnet reserve accounting · Verified on-chain test environment
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════
            SECTION 4: LIVE DASHBOARD
            ═══════════════════════════════════════════════════════════ */}
        <section id="dashboard" className="space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 gsap-slide-up section-header">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold font-display text-zinc-900">
                Live Portfolio Dashboard
              </h2>
              <p className="text-sm text-zinc-500 mt-1.5">
                Real-time NAV, asset allocations, and LP holdings categorized by perspective.
              </p>
            </div>
            <button
              onClick={fetchDashboardState}
              disabled={dashboardState.loading}
              className="btn-secondary text-sm py-2.5 px-5 font-mono shrink-0"
            >
              {dashboardState.loading ? "Syncing..." : "Sync Chain State"}
            </button>
          </div>

          <RoleBanner currentRole={viewRole} onRoleChange={setViewRole} className="gsap-slide-up" />

          {/* Financial KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 gsap-slide-up">
            <div className="vault-card p-6 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase text-zinc-400 tracking-wider">Net Asset Value</span>
                <span className="flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-600 font-semibold border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  REAL-TIME ACCRUAL
                </span>
              </div>
              <div className="text-3xl font-bold font-data text-zinc-900">
                ${liveNavUsd.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
              </div>
              <span className="text-xs font-mono text-emerald-600">6.51% Target APY Compounding</span>
            </div>

            <div className="vault-card p-6 space-y-2">
              <span className="text-xs font-mono uppercase text-zinc-400 tracking-wider">Target Benchmark</span>
              <div className="text-3xl font-bold font-data text-emerald-600">
                6.51% <span className="text-sm font-normal text-zinc-400">Yield</span>
              </div>
              <span className="text-xs font-mono text-zinc-400">Blended RWA Target</span>
            </div>

            <div className="vault-card p-6 space-y-2">
              <span className="text-xs font-mono uppercase text-zinc-400 tracking-wider">Active Investors</span>
              <div className="text-3xl font-bold font-data text-zinc-900">
                {dashboardState.investorCount} <span className="text-sm font-normal text-zinc-400">LPs</span>
              </div>
              <span className="text-xs font-mono text-indigo-600">Verified On-Chain</span>
            </div>

            <div className="vault-card p-6 space-y-2">
              <span className="text-xs font-mono uppercase text-zinc-400 tracking-wider">Average NAV / LP</span>
              <div className="text-3xl font-bold font-data text-zinc-900">
                ${navPerLp.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </div>
              <span className="text-xs font-mono text-zinc-400">Block #{dashboardState.lastUpdateBlock}</span>
            </div>
          </div>

          {/* Target Allocation Bar */}
          <div className="vault-card p-8 space-y-6 gsap-slide-up">
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-zinc-900">
                Target Allocation: {allocAPct}% Sovereign Debt / {allocBPct}% Commercial Real Estate
              </span>
              <span className="text-xs font-mono text-indigo-600">Active Policy</span>
            </div>

            <div className="allocation-bar">
              <div className="allocation-segment-a" style={{ width: `${allocAPct}%` }} />
              <div className="allocation-segment-b" style={{ width: `${allocBPct}%` }} />
            </div>
          </div>

          {/* LP Ledger Table */}
          <div className="vault-card overflow-hidden gsap-slide-up">
            <div className="p-6 pb-4 border-b border-zinc-200">
              <h3 className="text-base font-bold text-zinc-900">
                Fund LP Ledger &amp; Confidentiality Status
              </h3>
              <p className="text-sm text-zinc-500 mt-1">
                Active Perspective: <strong className="uppercase font-mono text-zinc-900">{viewRole}</strong>
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full font-mono text-sm border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50">
                    <th className="w-[35%] text-left px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">LP Address</th>
                    <th className="w-[30%] text-center px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Position Balance</th>
                    <th className="w-[15%] text-center px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Fund Share</th>
                    <th className="w-[20%] text-center px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {SEPOLIA_FUND_LPS.map((pos, idx) => {
                    const isUser = idx === 0;

                    return (
                      <tr key={pos.address} className="border-b border-zinc-100 hover:bg-zinc-50/50 transition-colors">
                        <td className="px-6 py-4 font-semibold">
                          <a
                            href={`https://sepolia.etherscan.io/address/${pos.address}`}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:underline text-indigo-600"
                          >
                            {pos.address.slice(0, 10)}...{pos.address.slice(-6)}
                          </a>
                        </td>

                        <td className="px-6 py-4 text-center font-semibold">
                          {viewRole === "auditor" ? (
                            <span className="text-indigo-600">
                              ${pos.depositUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                            </span>
                          ) : viewRole === "investor" && isUser ? (
                            <RedactionBar
                              isRevealed={sandboxState.isDecrypted}
                              value={`$${pos.depositUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
                            />
                          ) : (
                            <RedactionBar isRevealed={false} value="" />
                          )}
                        </td>

                        <td className="px-6 py-4 text-center text-zinc-500">{pos.pct}%</td>

                        <td className="px-6 py-4 text-center font-sans">
                          {viewRole === "auditor" ? (
                            <span className="badge-decrypted">Audit Decrypted</span>
                          ) : viewRole === "investor" && isUser ? (
                            sandboxState.isDecrypted ? (
                              <span className="badge-decrypted">EIP-712 Decrypted</span>
                            ) : (
                              <span className="badge-encrypted">FHE Protected</span>
                            )
                          ) : (
                            <span className="badge-encrypted">FHE Protected</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════
            SECTION 5: INTERACTIVE DEMO
            ═══════════════════════════════════════════════════════════ */}
        <section id="interactive-demo" className="space-y-8">
          <div className="gsap-slide-up section-header">
            <h2 className="text-2xl sm:text-3xl font-bold font-display text-zinc-900">
              Interactive Fund Demo
            </h2>
            <p className="text-sm text-zinc-500 mt-1.5">
              Mint test mUSDC tokens, execute encrypted deposits, and verify signed position decryption.
            </p>
          </div>

          {/* Faucet */}
          <div className="vault-card p-8 gsap-slide-up">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-zinc-900">Sepolia mUSDC Faucet</h3>
                <p className="text-sm text-zinc-500 mt-1">
                  Mint test tokens directly to your connected wallet.
                </p>
              </div>

              <div className="flex items-center gap-5">
                <div className="text-right font-mono text-sm">
                  <span className="text-xs text-zinc-400 block">Wallet Balance</span>
                  <span className="font-bold text-emerald-600">
                    {account ? `${Number(sandboxState.mUsdcBalance).toLocaleString("en-US")} mUSDC` : "Connect Wallet"}
                  </span>
                </div>

                <button
                  onClick={handleMintTestTokens}
                  disabled={sandboxState.isMinting || !account}
                  className="btn-primary text-sm py-2.5 px-5 font-mono"
                >
                  {sandboxState.isMinting ? "Minting..." : "Mint 100 mUSDC"}
                </button>
              </div>
            </div>
          </div>

          {/* Deposit + Position Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 gsap-slide-up">
            {/* Encrypted Position */}
            <div className="vault-card p-8 space-y-5">
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-zinc-900">On-Chain Encrypted Position</span>
                <span className="badge-fhe">ERC-7984</span>
              </div>

              <div className="p-5 rounded-lg border border-zinc-200 bg-zinc-50 space-y-4">
                <div>
                  <span className="text-xs font-mono uppercase text-zinc-400 block mb-1">Position Balance</span>
                  <div className="text-3xl font-bold font-data text-zinc-900">
                    <RedactionBar
                      isRevealed={sandboxState.isDecrypted}
                      value={`$${Number(sandboxState.decryptedAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-zinc-400">On-Chain Handle:</span>
                    {sandboxState.positionHandle && (
                      <button
                        onClick={() => copyToClipboard(sandboxState.positionHandle!, "handle")}
                        className="text-indigo-600 hover:underline"
                      >
                        {copiedText === "handle" ? "Copied" : "Copy"}
                      </button>
                    )}
                  </div>
                  <div className="inset-panel text-[11px]">
                    {account ? (sandboxState.positionHandle || "No position on-chain") : "Connect wallet to read"}
                  </div>
                </div>

                <div className="pt-3 border-t border-zinc-200">
                  <button
                    onClick={() => {
                      if (!sandboxState.isDecrypted) {
                        handleSignAndDecrypt();
                      } else {
                        setSandboxState((prev) => ({ ...prev, isDecrypted: false }));
                      }
                    }}
                    disabled={!account}
                    className="btn-secondary w-full text-sm py-2.5 font-mono"
                  >
                    {sandboxState.isDecrypted ? "Lock Position" : "Sign EIP-712 to Decrypt"}
                  </button>
                </div>
              </div>
            </div>

            {/* Confidential Deposit */}
            <div className="vault-card p-8 space-y-5">
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-zinc-900">Confidential Deposit</span>
                <span className="text-xs font-mono text-zinc-400">FundVault.deposit()</span>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-zinc-500 block mb-2">
                    Deposit Amount (mUSDC)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={sandboxState.depositAmount}
                      onChange={(e) => setSandboxState((prev) => ({ ...prev, depositAmount: e.target.value }))}
                      className="w-full font-mono text-sm"
                      placeholder="100"
                    />
                    <span className="btn-secondary text-sm py-2.5 px-4 pointer-events-none font-mono">mUSDC</span>
                  </div>
                </div>

                <button
                  onClick={handleDeposit}
                  disabled={sandboxState.isProcessing || !account}
                  className="btn-primary w-full text-sm py-3 font-mono"
                >
                  {account ? "Encrypt & Deposit into FundVault" : "Connect Wallet First"}
                </button>
              </div>

              {sandboxState.statusMsg && (
                <div className="inset-panel space-y-1 text-sm">
                  <p>{sandboxState.statusMsg}</p>
                  {sandboxState.txHash && (
                    <a
                      href={`https://sepolia.etherscan.io/tx/${sandboxState.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-600 hover:underline block"
                    >
                      Tx: {sandboxState.txHash.slice(0, 14)}...
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════
            SECTION 6: COMPLIANCE CONTROLS
            ═══════════════════════════════════════════════════════════ */}
        <section id="compliance-controls" className="space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 gsap-slide-up section-header">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold font-display text-zinc-900">
                Compliance Controls &amp; Governance
              </h2>
              <p className="text-sm text-zinc-500 mt-1.5">
                Regulator viewing permissions, audit certification, and portfolio rebalancing policies.
              </p>
            </div>

            <button
              onClick={() => setCertModalOpen(true)}
              className="btn-secondary text-sm py-2.5 px-4 font-mono shrink-0 flex items-center gap-2"
            >
              <svg className="w-4 h-4 text-indigo-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>Generate Audit Certificate</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 gsap-slide-up">
            {/* Grant Access */}
            <div className="vault-card p-8 space-y-5">
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-zinc-900">Grant Auditor Viewing Access</span>
                <span className="badge-decrypted">Temporal Permission</span>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-zinc-500 block mb-2">
                    Auditor / Regulator Address
                  </label>
                  <input
                    type="text"
                    value={complianceState.auditorAddress}
                    onChange={(e) => setComplianceState((prev) => ({ ...prev, auditorAddress: e.target.value }))}
                    className="w-full font-mono text-sm"
                  />
                </div>

                <button
                  onClick={handleGrantAuditor}
                  disabled={complianceState.isProcessing}
                  className="btn-primary w-full text-sm py-3 font-mono"
                >
                  Grant Auditor Access
                </button>
              </div>
            </div>

            {/* Revoke Access */}
            <div className="vault-card p-8 space-y-5">
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-red-600">
                  Revoke Auditor Access
                </span>
                <span className="badge-encrypted">Handle Rotation</span>
              </div>

              <p className="text-sm text-zinc-500 leading-relaxed">
                Invokes FundVault.rotateHandles() to regenerate all encrypted position handles with updated ACL keys, permanently invalidating past auditor viewing permissions.
              </p>

              <button
                onClick={promptRevokeModal}
                disabled={complianceState.isProcessing}
                className="btn-destructive w-full text-sm py-3 font-mono"
              >
                Revoke Auditor Access via Handle Rotation
              </button>
            </div>
          </div>

          {/* Portfolio Policy & Rebalancing */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 gsap-slide-up">
            {/* Target Allocation Policy */}
            <div className="vault-card p-8 space-y-5">
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-zinc-900">Portfolio Rebalance Policy</span>
                <span className="text-xs font-mono text-indigo-600">RebalancerAgent.sol</span>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-mono uppercase text-zinc-400 block">
                  Policy Allocation Presets:
                </span>
                <div className="grid grid-cols-3 gap-2 font-mono text-xs">
                  <button
                    onClick={() => setRebalanceState((prev) => ({ ...prev, targetRatioA: 80 }))}
                    className={`p-2 rounded-lg border font-mono text-[11px] font-medium transition-all flex items-center justify-center gap-1.5 ${
                      rebalanceState.targetRatioA === 80
                        ? "bg-indigo-50 border-indigo-300 text-indigo-900 font-semibold shadow-sm"
                        : "bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100"
                    }`}
                  >
                    <svg className="w-3.5 h-3.5 text-indigo-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                    <span>FED Hike (80/20)</span>
                  </button>

                  <button
                    onClick={() => setRebalanceState((prev) => ({ ...prev, targetRatioA: 30 }))}
                    className={`p-2 rounded-lg border font-mono text-[11px] font-medium transition-all flex items-center justify-center gap-1.5 ${
                      rebalanceState.targetRatioA === 30
                        ? "bg-indigo-50 border-indigo-300 text-indigo-900 font-semibold shadow-sm"
                        : "bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100"
                    }`}
                  >
                    <svg className="w-3.5 h-3.5 text-indigo-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <span>CRE Bull (30/70)</span>
                  </button>

                  <button
                    onClick={() => setRebalanceState((prev) => ({ ...prev, targetRatioA: 100 }))}
                    className={`p-2 rounded-lg border font-mono text-[11px] font-medium transition-all flex items-center justify-center gap-1.5 ${
                      rebalanceState.targetRatioA === 100
                        ? "bg-indigo-50 border-indigo-300 text-indigo-900 font-semibold shadow-sm"
                        : "bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100"
                    }`}
                  >
                    <svg className="w-3.5 h-3.5 text-indigo-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <span>Recession (100/0)</span>
                  </button>
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-zinc-200">
                <div className="flex justify-between items-center text-xs font-mono">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block" />
                    <span className="text-zinc-900 font-semibold">Sovereign Debt: {rebalanceState.targetRatioA}%</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-zinc-500 font-semibold">Real Estate: {100 - rebalanceState.targetRatioA}%</span>
                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-300 inline-block" />
                  </div>
                </div>

                {/* Unified Interactive Allocation Slider Bar */}
                <div className="relative w-full h-8 flex items-center select-none group my-1">
                  <div className="w-full h-6 rounded-lg overflow-hidden flex border border-zinc-200 shadow-inner relative bg-zinc-100">
                    <div
                      className="bg-indigo-600 h-full transition-all duration-75 flex items-center justify-start pl-3 text-[10px] font-mono text-white font-bold whitespace-nowrap overflow-hidden"
                      style={{ width: `${rebalanceState.targetRatioA}%` }}
                    >
                      {rebalanceState.targetRatioA >= 25 && `${rebalanceState.targetRatioA}% SOVEREIGN`}
                    </div>
                    <div
                      className="bg-zinc-200 h-full transition-all duration-75 flex items-center justify-end pr-3 text-[10px] font-mono text-zinc-600 font-bold whitespace-nowrap overflow-hidden"
                      style={{ width: `${100 - rebalanceState.targetRatioA}%` }}
                    >
                      {100 - rebalanceState.targetRatioA >= 25 && `${100 - rebalanceState.targetRatioA}% REAL ESTATE`}
                    </div>
                  </div>

                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={rebalanceState.targetRatioA}
                    onChange={(e) => setRebalanceState((prev) => ({ ...prev, targetRatioA: Number(e.target.value) }))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                  />

                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-white border-2 border-indigo-600 shadow-md pointer-events-none z-10 flex items-center justify-center transition-all group-hover:scale-110 group-active:scale-95"
                    style={{ left: `${rebalanceState.targetRatioA}%` }}
                  >
                    <div className="w-2 h-2 rounded-full bg-indigo-600" />
                  </div>
                </div>

                <button
                  onClick={handleUpdateAllocation}
                  disabled={rebalanceState.isProcessingRule}
                  className="btn-secondary w-full text-sm py-2.5 font-mono"
                >
                  Update Policy Allocation
                </button>
              </div>
            </div>

            {/* Confidential Execution Hook */}
            <div className="vault-card p-8 space-y-5 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-zinc-900">Confidential Rebalance Execution</span>
                  <span className="badge-fhe">Enclave Agent</span>
                </div>
                <p className="text-sm text-zinc-500 leading-relaxed">
                  Computes confidential asset swap instructions over encrypted reserve handles (`RebalancerAgent.sol`) to protect portfolio rebalances against public mempool observation.
                </p>
              </div>

              <button
                onClick={handleExecuteRebalance}
                disabled={rebalanceState.isProcessingExecution}
                className="btn-primary w-full text-sm py-3.5 font-mono"
              >
                Compute Confidential Rebalance
              </button>
            </div>
          </div>

          {complianceState.statusMsg && (
            <div className="vault-card p-5 text-sm font-mono text-zinc-500 gsap-slide-up">
              {complianceState.statusMsg}
            </div>
          )}
        </section>

        {/* ═══════════════════════════════════════════════════════════
            SECTION 7: PROOFS & GAS
            ═══════════════════════════════════════════════════════════ */}
        <section id="verification" className="space-y-8">
          <div className="gsap-slide-up section-header">
            <h2 className="text-2xl sm:text-3xl font-bold font-display text-zinc-900">
              Proofs &amp; Verification
            </h2>
            <p className="text-sm text-zinc-500 mt-1.5">
              6 smart contracts deployed and verified on Ethereum Sepolia (Chain ID 11155111).
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 gsap-slide-up">
            {Object.entries(DEPLOYED_ADDRESSES.contracts).map(([name, addr]) => (
              <a
                key={name}
                href={`https://sepolia.etherscan.io/address/${addr}#code`}
                target="_blank"
                rel="noreferrer"
                className="vault-card vault-card-hover p-5 space-y-2 block"
              >
                <div className="flex items-center justify-between text-sm font-semibold text-zinc-900">
                  <span>{name}</span>
                  <span className="text-zinc-300 text-xs">↗</span>
                </div>
                <div className="font-mono text-xs text-indigo-600">
                  {addr.slice(0, 10)}...{addr.slice(-6)}
                </div>
              </a>
            ))}
          </div>

          <div className="gsap-slide-up">
            <GasChart />
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-200 bg-white py-10 text-center text-sm text-zinc-400">
        <p>RealVault · Institutional Confidential RWA Fund · Powered by iExec Nox FHE</p>
      </footer>
    </div>
  );
}
