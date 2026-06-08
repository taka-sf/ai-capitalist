(function() {
'use strict';

const AGENTS_STORAGE_KEY = 'aic_agents_v1';

const DEFAULT_AGENTS = [
  {
    id: 'visionary',
    emoji: '🚀',
    name: { ja: 'ビジョナリスト', en: 'Visionary' },
    role: { ja: '起業家能力・アップサイド重視', en: 'Founder Potential & Upside' },
    color: '#a78bfa',
    bg: 'rgba(167,139,250,0.07)',
    border: 'rgba(167,139,250,0.22)',
    enabled: true,
    persona: 'You are an optimistic venture capitalist who deeply values founder quality, vision, and execution ability. You champion asymmetric returns and transformative potential. You think in 10-year horizons.',
    modeOverrides: {
      private: 'Focus on: founder track record, team composition, product vision, VC signal quality, exit potential. Key question: can this team build a $1B+ company?',
      public:  'Focus on: management quality, capital allocation track record, long-term competitive moat, why this stock is mispriced NOW. Key question: what does the market not see?',
      sme:     'Focus on: owner-operator quality, succession plan, domain expertise depth, local market dominance. Key question: is this a durable business with a trustworthy operator?'
    }
  },
  {
    id: 'realist',
    emoji: '📊',
    name: { ja: 'リアリスト', en: 'Realist' },
    role: { ja: '実績・現実的リターン重視', en: 'Track Record & Realistic Returns' },
    color: '#059669',
    bg: 'rgba(5,150,105,0.07)',
    border: 'rgba(5,150,105,0.22)',
    enabled: true,
    persona: 'You are a data-driven investor who prioritises verifiable track records and realistic return scenarios. You focus on what has already been demonstrated — not promised. You are skeptical of projections without evidence.',
    modeOverrides: {
      private: 'Focus on: ARR/MRR growth rate, NRR, CAC/LTV, burn multiple, runway. Benchmark against YC/a16z portfolio norms. Key question: do the unit economics work?',
      public:  'Focus on: EPS growth, FCF yield, ROE/ROIC trend, revenue quality, consensus vs actual. Key question: does the valuation reflect the earnings power?',
      sme:     'Focus on: operating cash flow consistency, EBITDA margin, debt/EBITDA, customer concentration, 3-year revenue trend. Key question: is this cash flow predictable?'
    }
  },
  {
    id: 'market',
    emoji: '🌊',
    name: { ja: 'マーケット派', en: 'Market Bull' },
    role: { ja: '市場規模・マクロ重視', en: 'Market Size & Macro Tailwinds' },
    color: '#34d399',
    bg: 'rgba(5,150,105,0.07)',
    border: 'rgba(5,150,105,0.22)',
    enabled: true,
    persona: 'You are a macro-oriented investor who believes market timing and TAM are the primary determinants of venture outcomes. A rising tide lifts all boats. You focus on whether the company is positioned in a large, fast-growing opportunity.',
    modeOverrides: {
      private: 'Focus on: TAM/SAM/SOM sizing, market CAGR, regulatory tailwinds, timing (why NOW), competitive white space. Key question: is this a $10B+ market being disrupted?',
      public:  'Focus on: sector rotation, macro tailwinds, industry growth vs GDP, global expansion optionality. Key question: is this sector in a multi-year uptrend?',
      sme:     'Focus on: local market size, industry stability, demographic tailwinds, barriers to entry protecting the niche. Key question: is this market large enough and stable enough?'
    }
  },
  {
    id: 'bear',
    emoji: '🐻',
    name: { ja: 'ベア派', en: 'Bear' },
    role: { ja: '悲観シナリオ・保守的リターン', en: 'Pessimistic / Conservative' },
    color: '#fbbf24',
    bg: 'rgba(251,191,36,0.07)',
    border: 'rgba(251,191,36,0.22)',
    enabled: true,
    persona: 'You are a conservative investor who builds base cases around realistic downside scenarios. You question growth assumptions, stress-test projections, and price risk conservatively.',
    modeOverrides: {
      private: 'Focus on: probability of going to zero, down-round risk, competitive moat durability, key-person dependency, dilution risk. Key question: what is the probability-weighted return?',
      public:  'Focus on: valuation downside in a rate-rise / earnings-miss scenario, short interest signals, insider selling, balance sheet stress. Key question: what is the downside if consensus is wrong?',
      sme:     'Focus on: customer concentration risk, owner health/succession, local economic sensitivity, debt maturity profile. Key question: what kills this business in a recession?'
    }
  },
  {
    id: 'devil',
    emoji: '😈',
    name: { ja: 'デビルズ・アドボケイト', en: "Devil's Advocate" },
    role: { ja: '最悪シナリオ・致命的リスク', en: 'Worst Case & Fatal Flaws' },
    color: '#f87171',
    bg: 'rgba(248,113,113,0.07)',
    border: 'rgba(248,113,113,0.22)',
    enabled: true,
    persona: "You are the most critical voice in the room. Your job is to find the fatal flaw — the single thing that could cause total loss. Challenge every assumption. Be incisive and unsparing.",
    modeOverrides: {
      private: 'Look for: fraud signals, fake metrics, conflicted investors, regulatory time-bomb, product that cannot scale, founder who cannot hire. Key question: why does this go to zero?',
      public:  'Look for: accounting irregularities, governance red flags, hidden liabilities, technology disruption risk, activist or short-seller thesis. Key question: is there a hidden catastrophe?',
      sme:     'Look for: single-customer dependency, owner burnout, undisclosed liabilities, landlord/lease risk, digital disruption of the core business. Key question: what does the seller know that we do not?'
    }
  }
];

function loadAgents() {
  try {
    const stored = localStorage.getItem(AGENTS_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch(e) {}
  return JSON.parse(JSON.stringify(DEFAULT_AGENTS));
}

function saveAgents(agents) {
  localStorage.setItem(AGENTS_STORAGE_KEY, JSON.stringify(agents));
}

function resetAgents() {
  localStorage.removeItem(AGENTS_STORAGE_KEY);
  return JSON.parse(JSON.stringify(DEFAULT_AGENTS));
}

function getActiveAgents() {
  return loadAgents().filter(a => a.enabled);
}

function buildAgentSystemPrompt(agent, modeDef) {
  const modeKey = modeDef.id;
  const override = agent.modeOverrides?.[modeKey] || '';
  return `${agent.persona}\n\n${override}\n\n${modeDef.agentGuidance || ''}`.trim();
}

if (typeof window !== 'undefined') {
  window.AgentsModule = { loadAgents, saveAgents, resetAgents, getActiveAgents, buildAgentSystemPrompt, DEFAULT_AGENTS };
}
})();
