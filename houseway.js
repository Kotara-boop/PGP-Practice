/* Pai Gow Poker houseway engine (per "Pai Gow Poker Houseway Rules.pdf").
 * Card: {id, rank 2..14 (A=14), suit 'S'|'H'|'D'|'C', joker:boolean}
 * Joker: completes a straight / flush / straight flush if that is possible
 * anywhere in the 7 cards; otherwise it is an Ace. If using the Joker for the
 * straight/flush would foul the hand (low outranks high), it plays as an Ace
 * and the whole hand is re-evaluated as an ordinary hand.
 * When more than one of a straight / flush / straight flush is possible in the
 * high hand, play the one that leaves the stronger low hand; if two splits
 * leave an identical low hand, prefer the stronger high hand.
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
    return highHandCategory(cards) > 0;
  }

  function highHandCategory(cards) {
    const non = cards.filter(c => !c.joker);
    const hasJoker = non.length !== cards.length;
    const flush = non.length === (hasJoker ? 4 : 5) &&
      non.every(c => c.suit === non[0].suit);
    const ranks = non.map(c => c.rank);
    const straight = (hasJoker ? ranks.length === 4 : ranks.length === 5) &&
      new Set(ranks).size === ranks.length &&
      Array.from({ length: 10 }, (_, i) => i + 1).some(start =>
        ranks.every(r => {
          const value = start === 1 && r === 14 ? 1 : r;
          return value >= start && value <= start + 4;
        }));

    if (flush && straight) return 3;
    if (flush) return 2;
    if (straight) return 1;
    return 0;
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
    const hasJoker = cards.some(c => c.joker);

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
    res.jokerNote = !hasJoker ? null
      : res.jokerAsAce ? 'Joker plays as an Ace (the Ace + big-pair exception would foul the hand).'
      : sf ? 'Joker is wild: it completes a straight/flush/straight flush.'
      : 'Joker plays as an Ace (no straight/flush possible).';
    res.hasSF = sf;
    if (!res.splits.length) throw new Error('No accepted split');
    return res;
  }

  function solveSF(cards) {
    const nat = cards.filter(c => !c.joker);
    const natCounts = groupsOf(nat.map(c => c.rank));
    const hasJoker = cards.some(c => c.joker);
    const candidates = SPLITS.map(split => ({
      split,
      category: highHandCategory(cards.filter((_, k) => !split.includes(k)))
    })).filter(candidate => candidate.category > 0);
    // Straight, flush, and straight flush candidates all compete on equal
    // footing: play whichever one leaves the stronger low hand.
    const valid = candidates.map(candidate => candidate.split);
    const catOf = new Map(candidates.map(c => [c.split.join(), c.category]));
    // Stronger low hand wins; on an identical low hand, prefer the stronger
    // high hand (straight flush > flush > straight).
    const best = (list) => {
      let m = -1, out = [];
      for (const s of list) {
        const sc = lowScore(rv(cards[s[0]], 14), rv(cards[s[1]], 14));
        if (sc > m) { m = sc; out = [s]; } else if (sc === m) out.push(s);
      }
      let mc = -1, tied = [];
      for (const s of out) {
        const cat = catOf.get(s.join());
        if (cat > mc) { mc = cat; tied = [s]; } else if (cat === mc) tied.push(s);
      }
      return tied;
    };
    const byValues = (target) => SPLITS.filter(([i, j]) => {
      const l = sortedDesc([rv(cards[i], 14), rv(cards[j], 14)]);
      return l[0] === target[0] && l[1] === target[1];
    });
    const nAces = nat.filter(c => c.rank === 14).length;
    const trips = natCounts.some(x => x[1] === 3);
    const pairs = natCounts.filter(x => x[1] === 2).map(x => x[0]);

    if (hasJoker && nAces === 2) {
      // Better-low-hand rule applies here too: the pair of Aces goes low when it
      // leaves a straight/flush high; otherwise one Ace plus the highest other card.
      const c = best(valid);
      if (c.length) return { category: 'Two Aces and a Joker with a Straight or Flush', rule: 'Play the straight/flush in the high hand and the strongest low hand that leaves it complete: the pair of Aces when possible, otherwise one Ace plus the highest other card.', splits: c };
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
        if (rest[0] === 14) {
          // The second low card would be the Joker, making a pair of Aces low that
          // outranks the pair in the high hand — a foul. The Joker cannot complete
          // the straight/flush in a valid set, so it plays as an Ace and the whole
          // hand is re-evaluated from the top (Joker + Ace + a pair becomes Two Pair).
          const vals = cards.map(c => rv(c, 14));
          const t = ordinaryTarget(vals);
          const splits = SPLITS.filter(([i, j]) => {
            const l = sortedDesc([vals[i], vals[j]]);
            return l[0] === t.lowValues[0] && l[1] === t.lowValues[1];
          });
          return { category: t.category, rule: t.rule, splits, jokerAsAce: true };
        }
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

  // Display order: grouped ranks first (quads/trips/pairs, larger group then
  // higher rank), then singles by rank; Joker last. Ties broken by suit.
  function sortForDisplay(list) {
    const counts = new Map();
    list.forEach(c => { if (!c.joker) counts.set(c.rank, (counts.get(c.rank) || 0) + 1); });
    return list.slice().sort((a, b) =>
      (counts.get(b.rank) || 0) - (counts.get(a.rank) || 0) ||
      b.rank - a.rank ||
      (a.joker ? 'Z' : a.suit).localeCompare(b.joker ? 'Z' : b.suit));
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

  // Hands whose houseway rule has a special condition: two pair, straight/flush with
  // one or two pair, three of a kind, plus the other conditional cases in the PDF.
  const EXCEPTION_CATEGORIES = new Set([
    'Two Pair',
    'Straight/Flush with Two Pair',
    'Straight/Flush with One Pair',
    'Straight/Flush with One Pair (Ace + big pair exception)',
    'Three of a Kind (Aces)',
    'Three of a Kind (Kings and below)',
    'Five Aces',
    'Four of a Kind (10s–7s)',
    'Two Aces and a Joker with a Straight or Flush'
  ]);

  const SF_TWO_PAIR = 'Straight/Flush with Two Pair';
  const SF_ACE_EXCEPTION = 'Straight/Flush with One Pair (Ace + big pair exception)';
  const TRIPS_ACES = 'Three of a Kind (Aces)';
  const TRIPS_OTHER = 'Three of a Kind (Kings and below)';
  const FIXED_SHARE = new Set([SF_TWO_PAIR, SF_ACE_EXCEPTION, TRIPS_ACES, TRIPS_OTHER]);
  const QUADS_TIERS = [
    { name: 'Four of a Kind (Aces–Jacks)', min: 11, max: 14 },
    { name: 'Four of a Kind (10s–7s)', min: 7, max: 10 },
    { name: 'Four of a Kind (6s and below)', min: 2, max: 6 }
  ];
  QUADS_TIERS.forEach(t => FIXED_SHARE.add(t.name));
  FIXED_SHARE.add('Five Aces');
  FIXED_SHARE.add('Two Aces and a Joker with a Straight or Flush');

  // Quads are too rare to find by rejection sampling, so build the hand directly.
  function dealQuads(rnd, tier) {
    for (;;) {
      const rank = tier.min + Math.floor(rnd() * (tier.max - tier.min + 1));
      const deck = newDeck();
      const quads = deck.filter(c => !c.joker && c.rank === rank);
      const rest = shuffle(deck.filter(c => c.joker || c.rank !== rank), rnd).slice(0, 3);
      const hand = shuffle(quads.concat(rest), rnd);
      if (solve(hand).category === tier.name) return hand;
    }
  }

  function dealUntil(rnd, accept) {
    for (;;) {
      const hand = deal(rnd);
      if (accept(solve(hand).category)) return hand;
    }
  }

  // Five Aces = four Aces + Joker; "with Kings" means the other two cards are a pair of Kings.
  function dealFiveAces(rnd, withKings) {
    const deck = newDeck();
    const base = deck.filter(c => c.joker || c.rank === 14);
    const others = deck.filter(c => !c.joker && c.rank !== 14);
    for (;;) {
      const extra = shuffle(others.slice(), rnd).slice(0, 2);
      const pairOfKings = extra.every(c => c.rank === 13);
      if (pairOfKings === withKings) return shuffle(base.concat(extra), rnd);
    }
  }

  const TWO_ACES_JOKER = 'Two Aces and a Joker with a Straight or Flush';

  // Joker + two Aces + four other cards, redealt until a straight/flush is possible.
  function dealTwoAcesJoker(rnd) {
    const deck = newDeck();
    const aces = deck.filter(c => !c.joker && c.rank === 14);
    const joker = deck.find(c => c.joker);
    const others = deck.filter(c => !c.joker && c.rank !== 14);
    for (;;) {
      const twoAces = shuffle(aces.slice(), rnd).slice(0, 2);
      const extra = shuffle(others.slice(), rnd).slice(0, 4);
      const hand = shuffle([joker, ...twoAces, ...extra], rnd);
      if (solve(hand).category === TWO_ACES_JOKER) return hand;
    }
  }

  // Fixed shares: 10% SF two pair, 10% SF Ace-exception, 12% each kind of three of a kind,
  // 3% each of the three four-of-a-kind tiers, 5% Five Aces (split with/without a pair of Kings),
  // 5% two Aces and a Joker with a straight/flush. The remaining ~37% is the other exception cases.
  function dealException(rnd = Math.random) {
    const roll = rnd();
    if (roll < 0.1) return dealUntil(rnd, c => c === SF_TWO_PAIR);
    if (roll < 0.2) return dealUntil(rnd, c => c === SF_ACE_EXCEPTION);
    if (roll < 0.32) return dealUntil(rnd, c => c === TRIPS_ACES);
    if (roll < 0.44) return dealUntil(rnd, c => c === TRIPS_OTHER);
    if (roll < 0.53) return dealQuads(rnd, QUADS_TIERS[Math.floor((roll - 0.44) / 0.03)]);
    if (roll < 0.58) return dealFiveAces(rnd, roll < 0.555);
    if (roll < 0.63) return dealTwoAcesJoker(rnd);
    // Plain two pair is so common that it would swamp the rarer cases.
    return dealUntil(rnd, c => EXCEPTION_CATEGORIES.has(c) && !FIXED_SHARE.has(c) &&
      (c !== 'Two Pair' || rnd() < 0.25));
  }

  /* ---- Winner prediction: hand evaluation, comparison, and outcome ---- */

  const PLURALS = { 2: '2s', 3: '3s', 4: '4s', 5: '5s', 6: '6s', 7: '7s', 8: '8s', 9: '9s', 10: '10s', 11: 'Jacks', 12: 'Queens', 13: 'Kings', 14: 'Aces' };

  // values: 5 rank values (Joker already resolved); flush: all one suit.
  // cat: 9 five of a kind, 8 SF, 7 quads, 6 full house, 5 flush, 4 straight,
  // 3 trips, 2 two pair, 1 pair, 0 high card. tb: tiebreak ranks, high first.
  function eval5values(values, flush) {
    const ranks = sortedDesc(values);
    const g = groupsOf(values);
    const pat = g.map(x => x[1]).join('');
    const uniq = [...new Set(ranks)];
    let sHigh = 0;
    if (uniq.length === 5) {
      if (uniq[0] - uniq[4] === 4) sHigh = uniq[0];
      else if (uniq[0] === 14 && uniq[1] === 5) sHigh = 5; // wheel
    }
    if (pat === '5') return { cat: 9, tb: [g[0][0]] };
    if (sHigh && flush) return { cat: 8, tb: [sHigh] };
    if (pat === '41') return { cat: 7, tb: [g[0][0], g[1][0]] };
    if (pat === '32') return { cat: 6, tb: [g[0][0], g[1][0]] };
    if (flush) return { cat: 5, tb: ranks };
    if (sHigh) return { cat: 4, tb: [sHigh] };
    if (pat === '311') return { cat: 3, tb: [g[0][0], g[1][0], g[2][0]] };
    if (pat === '221') return { cat: 2, tb: [g[0][0], g[1][0], g[2][0]] };
    if (pat === '2111') return { cat: 1, tb: [g[0][0], g[1][0], g[2][0], g[3][0]] };
    return { cat: 0, tb: ranks };
  }

  // Highest straight 4 natural ranks can make with the Joker; 0 if none.
  function straightHighWithJoker(ranks) {
    for (let start = 10; start >= 1; start--) {
      if (ranks.every(r => { const v = start === 1 && r === 14 ? 1 : r; return v >= start && v <= start + 4; }))
        return start === 1 ? 5 : start + 4;
    }
    return 0;
  }

  // Evaluate a 5-card hand. Joker: completes a straight/flush/straight flush if
  // possible (in a flush it is the highest rank of the suit not present);
  // otherwise it is an Ace.
  function eval5(cards) {
    const nat = cards.filter(c => !c.joker);
    if (nat.length === 5) return eval5values(nat.map(c => c.rank), nat.every(c => c.suit === nat[0].suit));
    const ranks = nat.map(c => c.rank);
    const cat = highHandCategory(cards);
    if (cat === 3) return { cat: 8, tb: [straightHighWithJoker(ranks)] };
    if (cat === 2) {
      let jr = 14; while (ranks.includes(jr)) jr--;
      return { cat: 5, tb: sortedDesc(ranks.concat(jr)) };
    }
    if (cat === 1) return { cat: 4, tb: [straightHighWithJoker(ranks)] };
    return eval5values(ranks.concat(14), false);
  }

  // Evaluate a 2-card low hand (the Joker is an Ace).
  function eval2(cards) {
    const v = cards.map(c => rv(c, 14));
    return v[0] === v[1] ? { cat: 1, tb: [v[0]] } : { cat: 0, tb: sortedDesc(v) };
  }

  function cmpTB(a, b) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const x = a[i] || 0, y = b[i] || 0;
      if (x !== y) return x > y ? 1 : -1;
    }
    return 0;
  }

  function cmpEval(x, y) { return x.cat !== y.cat ? (x.cat > y.cat ? 1 : -1) : cmpTB(x.tb, y.tb); }

  function name5(e) {
    switch (e.cat) {
      case 9: return `Five of a Kind, ${PLURALS[e.tb[0]]}`;
      case 8: return `Straight Flush, ${rn(e.tb[0])} high`;
      case 7: return `Four of a Kind, ${PLURALS[e.tb[0]]}`;
      case 6: return `Full House, ${PLURALS[e.tb[0]]} over ${PLURALS[e.tb[1]]}`;
      case 5: return `Flush, ${rn(e.tb[0])} high`;
      case 4: return `Straight, ${rn(e.tb[0])} high`;
      case 3: return `Three of a Kind, ${PLURALS[e.tb[0]]}`;
      case 2: return `Two Pair, ${PLURALS[e.tb[0]]} and ${PLURALS[e.tb[1]]}`;
      case 1: return `Pair of ${PLURALS[e.tb[0]]}`;
      default: return `${rn(e.tb[0])} high`;
    }
  }

  function name2(e) { return e.cat === 1 ? `Pair of ${PLURALS[e.tb[0]]}` : `${rn(e.tb[0])}-${rn(e.tb[1])} high`; }

  // Result of a round with the dealer's hand set by the given split. Copies go
  // to the dealer; a player whose low hand outranks the high hand fouls (an
  // automatic loss). cmps are from the player's perspective.
  function winnerOutcome(dealerCards, dealerSplit, playerHigh, playerLow) {
    const d = describeSplit(dealerCards, dealerSplit);
    const dh = eval5(d.high), dl = eval2(d.low);
    const ph = eval5(playerHigh), pl = eval2(playerLow);
    const foul = cmpEval(pl, ph) > 0;
    const highCmp = cmpEval(ph, dh), lowCmp = cmpEval(pl, dl);
    const outcome = foul ? 'foul'
      : highCmp > 0 && lowCmp > 0 ? 'win'
      : highCmp <= 0 && lowCmp <= 0 ? 'lose'
      : 'push';
    return { outcome, foul, highCmp, lowCmp, dh, dl, ph, pl };
  }

  // Deal a winner-prediction round from a single 53-card deck: 7 cards each for
  // the dealer and the player. The player's hand is pre-set — by houseway, or
  // (~20% of the time, when the cards allow it) fouled so the low hand outranks
  // the high hand.
  function dealWinner(rnd = Math.random) {
    const deck = shuffle(newDeck(), rnd);
    const dealer = deck.slice(0, 7);
    const player = deck.slice(7, 14);
    const fouls = SPLITS.filter(([i, j]) =>
      cmpEval(eval2([player[i], player[j]]), eval5(player.filter((_, k) => k !== i && k !== j))) > 0);
    const fouled = fouls.length > 0 && rnd() < 0.2;
    const split = fouled ? fouls[Math.floor(rnd() * fouls.length)] : solve(player).splits[0];
    return {
      dealer,
      player: { cards: player, high: player.filter((_, k) => !split.includes(k)), low: split.map(i => player[i]), fouled }
    };
  }

  const api = { dealException, dealWinner, winnerOutcome, eval5, eval2, name5, name2, jokerRole, newDeck, shuffle, deal, solve, isSF5, sfPossible, describeSplit, sortForDisplay, RANK_NAMES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Houseway = api;
})(typeof window !== 'undefined' ? window : globalThis);
