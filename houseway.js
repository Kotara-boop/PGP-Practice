/* Pai Gow Poker houseway engine (per "Pai Gow Poker Houseway Rules.pdf").
 * Card: {id, rank 2..14 (A=14), suit 'S'|'H'|'D'|'C', joker:boolean}
 * Joker: completes a straight / flush / straight flush if that is possible
 * anywhere in the 7 cards; otherwise it is an Ace.
 */
(function (root) {
  const SUITS = ['S', 'H', 'D', 'C'];
  const RANK_NAMES = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 14.5: 'Joker' };

  function newDeck() {
    const d = [];
    for (const s of SUITS) for (let r = 2; r <= 14; r++) d.push({ id: r + s, rank: r, suit: s, joker: false });
    d.push({ id: 'JK', rank: 14, suit: null, joker: true });
    return d;
  }

  function shuffle(a, rnd = Math.random) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function deal(rnd, forceJoker) {
    if (!forceJoker) return shuffle(newDeck(), rnd).slice(0, 7);
    const deck = newDeck();
    const joker = deck.pop();
    return shuffle(shuffle(deck, rnd).slice(0, 6).concat(joker), rnd);
  }

  function isSF5(cards) {
    const non = cards.filter(c => !c.joker);
    if (non.length >= 4 && non.every(c => c.suit === non[0].suit)) return true;
    const ranks = non.map(c => c.rank);
    if (new Set(ranks).size !== ranks.length) return false;
    for (let s = 1; s <= 10; s++) {
      if (ranks.every(r => { const v = s === 1 && r === 14 ? 1 : r; return v >= s && v <= s + 4; })) return true;
    }
    return false;
  }

  function combos(n, k) {
    const out = [];
    (function rec(start, cur) {
      if (cur.length === k) return out.push(cur.slice());
      for (let i = start; i < n; i++) { cur.push(i); rec(i + 1, cur); cur.pop(); }
    })(0, []);
    return out;
  }

  const SPLITS = combos(7, 2);
  const FIVES = combos(7, 5);

  function sfPossible(cards) {
    return FIVES.some(f => isSF5(f.map(i => cards[i])));
  }

  const rv = (c, jokerVal) => (c.joker ? jokerVal : c.rank);
  const sortedDesc = a => a.slice().sort((x, y) => y - x);
  const rn = r => RANK_NAMES[r];

  function groupsOf(values) {
    const m = new Map();
    values.forEach(v => m.set(v, (m.get(v) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  }

  // Result: {category, rule, lowValues:[hi,lo]}; splits chosen by rank-value match.
  function ordinaryTarget(values) {
    const g = groupsOf(values);
    const pat = g.map(x => x[1]).join('');
    const R = g.map(x => x[0]);
    const singles = g.filter(x => x[1] === 1).map(x => x[0]);
    const T = (category, rule, low) => ({ category, rule, lowValues: sortedDesc(low) });

    if (g[0][1] === 5 && R[0] === 14) {
      const kk = g.find(x => x[0] === 13 && x[1] >= 2);
      return kk
        ? T('Five Aces', 'Play a pair of Aces in the low hand unless a pair of Kings can be played in the low hand.', [13, 13])
        : T('Five Aces', 'Play a pair of Aces in the low hand unless a pair of Kings can be played in the low hand.', [14, 14]);
    }
    if (pat === '43') return T('Four of a Kind with Three of a Kind', 'Put the highest pair in the low hand; play the full house or the four of a kind in the high hand.', [Math.max(R[0], R[1]), Math.max(R[0], R[1])]);
    if (pat === '421') return T('Four of a Kind with a Pair', 'Play the pair in the low hand, four of a kind in the high hand.', [R[1], R[1]]);
    if (pat === '4111') {
      const q = R[0], k = singles;
      if (q >= 11) return T('Four of a Kind (Aces–Jacks)', 'Aces, Kings, Queens, Jacks: always split.', [q, q]);
      if (q >= 7) {
        return k[0] >= 13
          ? T('Four of a Kind (10s–7s)', 'Play four of a kind high if you can put at least a King in the low hand; otherwise split and play a pair low.', [k[0], k[1]])
          : T('Four of a Kind (10s–7s)', 'Play four of a kind high if you can put at least a King in the low hand; otherwise split and play a pair low.', [q, q]);
      }
      return T('Four of a Kind (6s and below)', 'Never split: four of a kind high, next two highest cards low.', [k[0], k[1]]);
    }
    if (pat === '322') return T('Full House with a Pair', 'Place the higher pair in the low hand, keep the full house complete in the high hand.', [R[1], R[1]]);
    if (pat === '3211') return T('Full House', 'Put the pair in the low hand and play the three of a kind in the high hand.', [R[1], R[1]]);
    if (pat === '331') return T('Two Sets of Three of a Kind', 'Place a pair from the higher set in the low hand, three of a kind in the high hand.', [R[0], R[0]]);
    if (pat === '31111') {
      return R[0] === 14
        ? T('Three of a Kind (Aces)', 'Aces: place an Ace and the next highest card in the low hand.', [14, singles[0]])
        : T('Three of a Kind (Kings and below)', 'Place the three of a kind in the high hand and the next two highest cards in the low hand.', [singles[0], singles[1]]);
    }
    if (pat === '2221') return T('Three Pair', 'Place the highest pair in the low hand, two pair in the high hand.', [R[0], R[0]]);
    if (pat === '22111') return twoPair(R[0], R[1], singles, T);
    if (pat === '211111') return T('One Pair', 'Place the pair in the high hand, highest other two cards in the low hand.', [singles[0], singles[1]]);
    if (pat === '1111111') return T('No Pair', 'Place the second and third highest cards in the low hand.', [sortedDesc(values)[1], sortedDesc(values)[2]]);
    throw new Error('Unhandled pattern ' + pat);
  }

  function twoPair(big, small, k, T) {
    const name = 'Two Pair';
    if (big >= 11) return T(name, 'Big pair Aces–Jacks: split the pairs, smaller pair in the low hand.', [small, small]);
    if (big >= 7) {
      return k[0] >= 14
        ? T(name, 'Big pair 10s–7s: both pairs high if you can place an Ace in the low hand; otherwise split.', [k[0], k[1]])
        : T(name, 'Big pair 10s–7s: both pairs high if you can place an Ace in the low hand; otherwise split.', [small, small]);
    }
    return k[0] >= 13
      ? T(name, 'Big pair 6s–3s: both pairs high if you can place an Ace or King in the low hand; otherwise split.', [k[0], k[1]])
      : T(name, 'Big pair 6s–3s: both pairs high if you can place an Ace or King in the low hand; otherwise split.', [small, small]);
  }

  const lowScore = (a, b) => {
    const hi = Math.max(a, b), lo = Math.min(a, b);
    return hi === lo ? 1000 + hi : hi * 15 + lo;
  };

  function solve(cards) {
    const sf = sfPossible(cards);
    const jokerAsWild = sf && cards.some(c => c.joker);
    const jokerNote = cards.some(c => c.joker)
      ? (jokerAsWild ? 'Joker is wild: it completes a straight/flush/straight flush.' : 'Joker plays as an Ace (no straight/flush possible).')
      : null;

    let res;
    if (!sf) {
      const vals = cards.map(c => rv(c, 14));
      const t = ordinaryTarget(vals);
      const splits = SPLITS.filter(([i, j]) => {
        const l = sortedDesc([vals[i], vals[j]]);
        return l[0] === t.lowValues[0] && l[1] === t.lowValues[1];
      });
      res = { category: t.category, rule: t.rule, splits };
    } else {
      res = solveSF(cards);
    }
    res.jokerNote = jokerNote;
    res.hasSF = sf;
    if (!res.splits.length) throw new Error('No accepted split');
    return res;
  }

  function solveSF(cards) {
    const nat = cards.filter(c => !c.joker);
    const natCounts = groupsOf(nat.map(c => c.rank));
    const hasJoker = cards.some(c => c.joker);
    const valid = SPLITS.filter(([i, j]) =>
      isSF5(cards.filter((_, k) => k !== i && k !== j)));
    const best = (list) => {
      let m = -1, out = [];
      for (const s of list) {
        const sc = lowScore(rv(cards[s[0]], 14), rv(cards[s[1]], 14));
        if (sc > m) { m = sc; out = [s]; } else if (sc === m) out.push(s);
      }
      return out;
    };
    const byValues = (target) => SPLITS.filter(([i, j]) => {
      const l = sortedDesc([rv(cards[i], 14), rv(cards[j], 14)]);
      return l[0] === target[0] && l[1] === target[1];
    });
    const nAces = nat.filter(c => c.rank === 14).length;
    const trips = natCounts.some(x => x[1] === 3);
    const pairs = natCounts.filter(x => x[1] === 2).map(x => x[0]);

    if (hasJoker && nAces === 2) {
      const c = best(valid.filter(([i, j]) =>
        [i, j].filter(k => !cards[k].joker && cards[k].rank === 14).length === 1 && !cards[i].joker && !cards[j].joker));
      if (c.length) return { category: 'Two Aces and a Joker with a Straight or Flush', rule: 'Play the straight or flush in the high hand, and one Ace plus the other card in the low hand.', splits: c };
    }
    if (trips) {
      const c = best(valid.filter(([i, j]) => !cards[i].joker && !cards[j].joker && cards[i].rank === cards[j].rank));
      if (c.length) return { category: 'Straight/Flush with Three of a Kind', rule: 'Put the highest pair in the low hand (Full House strategy); keep the complete straight/flush in the high hand.', splits: c };
    }
    if (pairs.length >= 2) {
      // Joker kept as a distinct top card so it can't pair with a natural Ace.
      const vals = cards.map(c => rv(c, 14.5));
      const g = groupsOf(vals);
      const k = g.filter(x => x[1] === 1).map(x => x[0]);
      const t = twoPair(pairs[0], pairs[1], k, (category, rule, low) => ({ category, rule, lowValues: sortedDesc(low) }));
      const splits = SPLITS.filter(([i, j]) => {
        const l = sortedDesc([vals[i], vals[j]]);
        return l[0] === t.lowValues[0] && l[1] === t.lowValues[1];
      });
      if (splits.length) return { category: 'Straight/Flush with Two Pair', rule: 'Play according to Two Pair strategy. ' + t.rule, splits };
    }
    if (pairs.length === 1) {
      const p = pairs[0];
      if (nAces >= 1 && p >= 10 && p <= 13) {
        const c = best(valid.filter(([i, j]) => [i, j].some(k => !cards[k].joker && cards[k].rank === 14)));
        const rule = 'With an Ace and a pair of Kings/Queens/Jacks/Tens: Ace low and pair high, unless you can place the Ace low and keep the straight/flush high.';
        if (c.length) return { category: 'Straight/Flush with One Pair (Ace + big pair exception)', rule, splits: c };
        const others = cards.map((c, idx) => ({ v: rv(c, 14), idx, nat: !c.joker && c.rank === p }))
          .filter(x => !x.nat).map(x => x.v);
        const o = sortedDesc(others);
        // one Ace goes low; the other low card is the highest remaining
        const rest = o.slice(); rest.splice(rest.indexOf(14), 1);
        return { category: 'Straight/Flush with One Pair (Ace + big pair exception)', rule, splits: byValues([14, rest[0]]) };
      }
      const c = best(valid);
      if (c.length) return { category: 'Straight/Flush with One Pair', rule: 'Place the highest possible two cards (pair or no pair) in the low hand that leave a complete straight/flush in the high hand.', splits: c };
    }
    const c = best(valid);
    if (c.length) return { category: 'Straight/Flush with No Pair', rule: 'Place the two highest cards in the low hand that leave the complete straight/flush in the high hand.', splits: c };
    throw new Error('No valid SF split');
  }

  function describeSplit(cards, split) {
    return { low: split.map(i => cards[i]), high: cards.filter((_, k) => !split.includes(k)) };
  }

  // Describes what the Joker stands for in the given split, e.g. "Joker = 5 (completes the straight)".
  function jokerRole(cards, split) {
    const ji = cards.findIndex(c => c.joker);
    if (ji < 0) return null;
    if (split.includes(ji)) return 'Joker = Ace (it is in the low hand)';
    const high = cards.filter((_, k) => !split.includes(k));
    const nat = high.filter(c => !c.joker);
    const suitSame = nat.every(c => c.suit === nat[0].suit);
    const isStraight = (ranks) => {
      if (new Set(ranks).size !== 5) return false;
      for (let s = 1; s <= 10; s++) if (ranks.every(r => { const v = s === 1 && r === 14 ? 1 : r; return v >= s && v <= s + 4; })) return true;
      return false;
    };
    const natRanks = nat.map(c => c.rank);
    const fits = [];
    for (let r = 2; r <= 14; r++) if (isStraight([...natRanks, r])) fits.push(r);
    const flush = nat.length === 4 && suitSame;
    const sym = { S: '♠', H: '♥', D: '♦', C: '♣' };
    if (fits.length && flush) return `Joker = ${fits.map(rn).join(' or ')} of ${sym[nat[0].suit]} (completes the straight flush)`;
    if (fits.length) return `Joker = ${fits.map(rn).join(' or ')} (completes the straight)`;
    if (flush) return `Joker = any ${sym[nat[0].suit]} (completes the flush)`;
    return 'Joker = Ace';
  }

  const api = { jokerRole, newDeck, shuffle, deal, solve, isSF5, sfPossible, describeSplit, RANK_NAMES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Houseway = api;
})(typeof window !== 'undefined' ? window : globalThis);
