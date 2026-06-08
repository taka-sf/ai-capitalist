(function() {
'use strict';

const MODES_STORAGE_KEY = 'aic_modes_v1';

const DEFAULT_MODES = [
  {
    id: 'private',
    label: { ja: '未公開株・スタートアップ', en: 'Private Equity / Startup' },
    icon: '🚀',
    color: '#a78bfa',
    autoDetect: [],
    researchSections: [
      { key: 'founder',     weight: 10, label: { ja: '創業者・経営陣',   en: 'Founders & Team'        }, enabled: true },
      { key: 'product',     weight: 9,  label: { ja: '事業・プロダクト', en: 'Business & Product'      }, enabled: true },
      { key: 'market',      weight: 9,  label: { ja: '市場規模・成長性', en: 'Market Size & Growth'    }, enabled: true },
      { key: 'competitors', weight: 7,  label: { ja: '競合比較',         en: 'Competitive Landscape'   }, enabled: true },
      { key: 'fundraising', weight: 8,  label: { ja: '資金調達履歴',     en: 'Fundraising History'     }, enabled: true },
      { key: 'investors',   weight: 8,  label: { ja: '投資家シグナル',   en: 'Investor Signal'         }, enabled: true },
      { key: 'financials',  weight: 7,  label: { ja: '財務・KPI実績',    en: 'Financials & KPIs'       }, enabled: true },
      { key: 'returns',     weight: 9,  label: { ja: 'リターン試算',     en: 'Return Scenarios'        }, enabled: true },
      { key: 'risks',       weight: 8,  label: { ja: 'リスク分析',       en: 'Risk Analysis'           }, enabled: true }
    ],
    returnMetric: 'MOIC_IRR',
    agentGuidance: 'Provide MOIC and IRR estimates for Bull/Base/Bear scenarios. Reference comparable VC-backed exits where possible.',
    researchPromptExtra: `
Research focus for PRIVATE EQUITY / STARTUP:
- Founder background: education, prior companies, domain expertise, prior exits
- Product: what problem solved, differentiation, defensibility (IP, network effects, switching costs)
- Market: TAM/SAM/SOM with methodology, CAGR source, why NOW
- Traction: ARR/MRR, growth rate, NRR, logo count, key customers
- Unit economics: CAC, LTV, payback period, burn multiple
- Fundraising: all rounds with amounts, dates, post-money, lead investors
- Cap table signals: tier-1 VC presence, pro-rata rights, SAFEs outstanding
- Return scenarios: MOIC / IRR for 3x, 7x, 15x revenue exit multiples
`
  },
  {
    id: 'public',
    label: { ja: '公開株・ロングオンリー', en: 'Public Equity / Long-Only' },
    icon: '📈',
    color: '#059669',
    autoDetect: [],
    researchSections: [
      { key: 'business',    weight: 8,  label: { ja: '事業概要',         en: 'Business Overview'       }, enabled: true },
      { key: 'management',  weight: 7,  label: { ja: '経営陣・ガバナンス',en: 'Management & Governance' }, enabled: true },
      { key: 'market',      weight: 8,  label: { ja: '市場・業界',       en: 'Industry & Market'       }, enabled: true },
      { key: 'financials',  weight: 10, label: { ja: '財務分析',         en: 'Financial Analysis'      }, enabled: true },
      { key: 'valuation',   weight: 10, label: { ja: 'バリュエーション', en: 'Valuation & Comps'       }, enabled: true },
      { key: 'competitors', weight: 7,  label: { ja: '競合比較',         en: 'Competitive Position'    }, enabled: true },
      { key: 'risks',       weight: 8,  label: { ja: 'リスク',           en: 'Key Risks'               }, enabled: true },
      { key: 'returns',     weight: 9,  label: { ja: 'リターン試算',     en: 'Return Scenarios'        }, enabled: true }
    ],
    returnMetric: 'CAGR',
    agentGuidance: 'Provide 1-year, 3-year price targets with CAGR. Reference EV/EBITDA, P/E, P/S vs peers. Comment on margin of safety.',
    researchPromptExtra: `
Research focus for PUBLIC EQUITY / LONG-ONLY:
- Business model: revenue streams, recurring vs transactional, geographic mix
- Financial metrics: revenue growth, gross margin, EBITDA margin, FCF conversion, ROIC, ROE
- Valuation: current EV/EBITDA, P/E, EV/Sales vs 3-year history and sector peers
- Balance sheet: net cash/debt, debt maturity schedule, dividend policy
- Earnings quality: accruals ratio, cash conversion cycle, revenue recognition
- Analyst consensus: buy/hold/sell ratio, price target spread, estimate revision trend
- Technical: 52-week range, volume trend, short interest
- Return scenarios: price targets at bull/base/bear multiple expansions
`
  },
  {
    id: 'sme',
    label: { ja: '中小企業・伝統産業', en: 'SME / Traditional Business' },
    icon: '🏢',
    color: '#fbbf24',
    autoDetect: [],
    researchSections: [
      { key: 'owner',       weight: 10, label: { ja: 'オーナー・後継者', en: 'Owner & Succession'       }, enabled: true },
      { key: 'business',    weight: 9,  label: { ja: '事業概要・歴史',   en: 'Business & History'       }, enabled: true },
      { key: 'market',      weight: 7,  label: { ja: '地域市場・業界',   en: 'Local Market & Industry'  }, enabled: true },
      { key: 'financials',  weight: 10, label: { ja: '財務・CF',         en: 'Financials & Cash Flow'   }, enabled: true },
      { key: 'valuation',   weight: 9,  label: { ja: 'バリュエーション', en: 'Valuation & M&A Comps'   }, enabled: true },
      { key: 'competitors', weight: 6,  label: { ja: '競合状況',         en: 'Local Competition'        }, enabled: true },
      { key: 'risks',       weight: 9,  label: { ja: 'リスク分析',       en: 'Risk Analysis'            }, enabled: true },
      { key: 'returns',     weight: 9,  label: { ja: 'リターン試算',     en: 'Return Scenarios'        }, enabled: true }
    ],
    returnMetric: 'MOIC',
    agentGuidance: 'Provide MOIC based on EV/EBITDA acquisition multiples and DCF. Reference M&A comps in the sector. Consider illiquidity discount.',
    researchPromptExtra: `
Research focus for SME / TRADITIONAL BUSINESS:
- Owner profile: age, tenure, succession intention, family involvement
- Business history: founding year, key milestones, reputation signals
- Financial: revenue trend 3 years, EBITDA margin, operating cash flow, capex intensity
- Balance sheet: debt/EBITDA, net debt, fixed asset base, working capital
- Customer base: concentration (top 3 customers as % revenue), contract lengths
- Competitive moat: local market position, switching costs, supplier relationships
- Valuation: EV/EBITDA vs regional M&A comps, DCF with 3 scenarios
- Return: MOIC at 5x / 7x / 10x EBITDA exit; assume 3-5 year hold
`
  }
];

function loadModes() {
  try {
    const stored = localStorage.getItem(MODES_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch(e) {}
  return JSON.parse(JSON.stringify(DEFAULT_MODES));
}

function saveModes(modes) {
  localStorage.setItem(MODES_STORAGE_KEY, JSON.stringify(modes));
}

function resetModes() {
  localStorage.removeItem(MODES_STORAGE_KEY);
  return JSON.parse(JSON.stringify(DEFAULT_MODES));
}

function getModeById(id) {
  return loadModes().find(m => m.id === id) || loadModes()[0];
}

if (typeof window !== 'undefined') {
  window.ModesModule = { loadModes, saveModes, resetModes, getModeById, DEFAULT_MODES };
}
})();
