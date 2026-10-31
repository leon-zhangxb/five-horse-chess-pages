/* ==========================================================================
   五马棋 · 规则引擎（H5 版）
   移植自 iOS：Engine/GameEngine.swift + Engine/AIPlayer.swift + GameViewModel.swift
   纯函数 + 状态机，无 DOM 依赖：浏览器 <script> 引入 / Node require 两用。
   ========================================================================== */
(function (root) {
  'use strict';

  // ---------------- 棋位 ----------------
  // 坐标 {r, c}：棋盘 5×5（r 0..4，r0 在上）；庙内 r 为负。
  // 庙：尚 top(-2,2) / 和 left(-1,1) / 菱形中心 center(-1,2) / 庙 right(-1,3)
  // 庙门 gate = (0,2)（棋盘上沿中点，属棋盘，不属于庙内四点）
  var GATE = { r: 0, c: 2 };
  var TEMPLE = {
    top:    { r: -2, c: 2 },
    left:   { r: -1, c: 1 },
    center: { r: -1, c: 2 },
    right:  { r: -1, c: 3 }
  };
  var TEMPLE_POINTS = [TEMPLE.top, TEMPLE.left, TEMPLE.center, TEMPLE.right];

  function same(a, b) { return a.r === b.r && a.c === b.c; }
  function isOnBoard(p) { return p.r >= 0 && p.r < 5 && p.c >= 0 && p.c < 5; }
  function templeKeyOf(p) {
    if (p.r === -2 && p.c === 2) return 'top';
    if (p.r === -1 && p.c === 1) return 'left';
    if (p.r === -1 && p.c === 2) return 'center';
    if (p.r === -1 && p.c === 3) return 'right';
    return null;
  }
  function isInTempleInterior(p) { return templeKeyOf(p) !== null; }
  function isTempleGate(p) { return same(p, GATE); }
  function isPlayable(p, mode17) {
    return isOnBoard(p) || (isInTempleInterior(p) && mode17);
  }

  // ---------------- 连线（走子路线，含中间点）----------------
  // 规则：两点在同一条连线上、中间无棋子阻挡，即可沿线滑行任意长度。
  var LINES = (function () {
    var L = [];
    // 5 条横线
    for (var r = 0; r < 5; r++) {
      L.push([{ r: r, c: 0 }, { r: r, c: 1 }, { r: r, c: 2 }, { r: r, c: 3 }, { r: r, c: 4 }]);
    }
    // 5 条竖线（第 2 列向上贯通庙：尚-中-庙门-棋盘；庙门只出现一次）
    for (var c = 0; c < 5; c++) {
      if (c === 2) {
        L.push([TEMPLE.top, TEMPLE.center, GATE,
                { r: 1, c: 2 }, { r: 2, c: 2 }, { r: 3, c: 2 }, { r: 4, c: 2 }]);
      } else {
        L.push([{ r: 0, c: c }, { r: 1, c: c }, { r: 2, c: c }, { r: 3, c: c }, { r: 4, c: c }]);
      }
    }
    // 6 条长线（两条全对角 + 庙门两侧斜线 + 左中/底中/右中）
    L.push([{ r: 0, c: 0 }, { r: 1, c: 1 }, { r: 2, c: 2 }, { r: 3, c: 3 }, { r: 4, c: 4 }]);
    L.push([{ r: 4, c: 0 }, { r: 3, c: 1 }, { r: 2, c: 2 }, { r: 1, c: 3 }, { r: 0, c: 4 }]);
    L.push([TEMPLE.right, GATE, { r: 1, c: 1 }, { r: 2, c: 0 }]);
    L.push([TEMPLE.left, GATE, { r: 1, c: 3 }, { r: 2, c: 4 }]);
    L.push([{ r: 2, c: 0 }, { r: 3, c: 1 }, { r: 4, c: 2 }]);
    L.push([{ r: 4, c: 2 }, { r: 3, c: 3 }, { r: 2, c: 4 }]);
    // 庙：菱形上两边 + 内横线（内竖线已含在 col2 竖线；下两边与长线共线贯通）
    L.push([TEMPLE.top, TEMPLE.left]);
    L.push([TEMPLE.top, TEMPLE.right]);
    L.push([TEMPLE.left, TEMPLE.center, TEMPLE.right]);
    return L;
  })();

  var OPP = { red: 'blue', blue: 'red', main: 'soldier', soldier: 'main' };

  function lineIndexOf(line, p) {
    for (var i = 0; i < line.length; i++) { if (same(line[i], p)) return i; }
    return -1;
  }

  // ---------------- 沿线滑行 ----------------
  // 同一条连线、中间无阻挡的空位皆可走（遇棋子即止，不可越过）。
  // 17 子模式变体——士兵禁落庙门、不禁过：落点不含庙门 (0,2)，但庙门为空时可沿线滑过。
  function legalMoves(from, pieceAt, mode17) {
    if (!isPlayable(from, mode17)) return [];
    var soldierBannedAtGate = mode17 && pieceAt(from) === 'soldier';
    var result = [];
    for (var li = 0; li < LINES.length; li++) {
      var line = LINES[li];
      var idx = lineIndexOf(line, from);
      if (idx < 0) continue;
      var dirs = [-1, 1];
      for (var di = 0; di < 2; di++) {
        var i = idx;
        while (true) {
          var next = i + dirs[di];
          if (next < 0 || next >= line.length) break;
          var target = line[next];
          if (pieceAt(target)) break; // 有棋子：不可落也不可越
          if (isPlayable(target, mode17) && !(soldierBannedAtGate && isTempleGate(target))) {
            result.push(target);
          }
          i = next;
        }
      }
    }
    return result;
  }

  function canMove(from, to, pieceAt, mode17) {
    if (same(from, to)) return false;
    var moves = legalMoves(from, pieceAt, mode17);
    for (var i = 0; i < moves.length; i++) { if (same(moves[i], to)) return true; }
    return false;
  }

  function hasAnyLegalMove(pos, pieceAt, mode17) {
    return legalMoves(pos, pieceAt, mode17).length > 0;
  }

  // ---------------- 某方是否全部棋子无路可走 ----------------
  function allBlocked(player, pieceAt, mode17) {
    for (var r = 0; r < 5; r++) {
      for (var c = 0; c < 5; c++) {
        if (pieceAt({ r: r, c: c }) === player &&
            hasAnyLegalMove({ r: r, c: c }, pieceAt, mode17)) return false;
      }
    }
    if (mode17) {
      for (var i = 0; i < TEMPLE_POINTS.length; i++) {
        var p = TEMPLE_POINTS[i];
        if (pieceAt(p) === player && hasAnyLegalMove(p, pieceAt, mode17)) return false;
      }
    }
    return true;
  }

  // ---------------- 共线三连位（夹/挑的几何前提）----------------
  // 只遍历真实连线，保证三点共线；坐标相邻但无线相连的组合不会被枚举。
  function collinearTriples(pos) {
    var triples = [];
    for (var li = 0; li < LINES.length; li++) {
      var line = LINES[li];
      var idx = lineIndexOf(line, pos);
      if (idx < 0) continue;
      var inRange = function (i) { return i >= 0 && i < line.length; };
      var steps = [-1, 1];
      for (var si = 0; si < 2; si++) {
        var step = steps[si];
        if (!inRange(idx + step)) continue;
        triples.push({
          near: line[idx + step],
          far: inRange(idx + step * 2) ? line[idx + step * 2] : null,
          opposite: inRange(idx - step) ? line[idx - step] : null
        });
      }
    }
    return triples;
  }

  // ---------------- 吃子判定（夹 / 挑）----------------
  // 夹 = 同一连线上「己—敌—己」；挑 = 「敌—己—敌」。
  // 17 子模式：士兵不能吃主将（直接返回空）。
  function checkCaptures(pos, player, pieceAt, mode17) {
    if (mode17 && player === 'soldier') return [];
    var opponent = OPP[player];
    var captured = [];
    function collect(p) {
      if (!p) return;
      if (pieceAt(p) !== opponent) return;
      for (var i = 0; i < captured.length; i++) { if (same(captured[i], p)) return; }
      captured.push(p);
    }
    var triples = collinearTriples(pos);
    for (var i = 0; i < triples.length; i++) {
      var t = triples[i];
      // 夹：己(pos)—敌(相邻)—己(再相邻)
      if (t.far && pieceAt(t.near) === opponent && pieceAt(t.far) === player) {
        collect(t.near);
      }
      // 挑：敌(相邻)—己(pos)—敌(对面相邻)
      if (t.opposite && pieceAt(t.near) === opponent && pieceAt(t.opposite) === opponent) {
        collect(t.near);
        collect(t.opposite);
      }
    }
    return captured;
  }

  // ---------------- AI 棋盘评估（移植 evaluateBoard）----------------
  // reserves: {red, blue}
  function evaluateBoard(player, pieceAt, reserves, mode17) {
    var opponent = OPP[player];
    var score = 0;
    var myCount = 0, oppCount = 0;
    var allPos = [];
    for (var r = 0; r < 5; r++) for (var c = 0; c < 5; c++) allPos.push({ r: r, c: c });
    for (var i = 0; i < TEMPLE_POINTS.length; i++) allPos.push(TEMPLE_POINTS[i]);

    for (var j = 0; j < allPos.length; j++) {
      var pc = pieceAt(allPos[j]);
      if (pc === player) myCount++;
      else if (pc === opponent) oppCount++;
    }

    if (mode17) {
      score += myCount * 10 - oppCount * 10 + (player === 'main' ? 50 : 0);
      // 主将的活动空间就是生存空间：逼 AI 突围/进攻，而不是庙内原地反弹
      if (player === 'main') {
        for (var k = 0; k < allPos.length; k++) {
          if (pieceAt(allPos[k]) === 'main') {
            score += legalMoves(allPos[k], pieceAt, mode17).length * 4;
          }
        }
      }
    } else {
      score += myCount * 15 - oppCount * 15;
      if (player === 'red') score += reserves.red * 8 - reserves.blue * 8;
      else if (player === 'blue') score += reserves.blue * 8 - reserves.red * 8;
      // 位置优势：朝向庙的顶部（row 小）、靠中轴（|c-2| 小）
      for (var r2 = 0; r2 < 5; r2++) {
        for (var c2 = 0; c2 < 5; c2++) {
          if (pieceAt({ r: r2, c: c2 }) === player) {
            score += (4 - r2) * 2 + (2 - Math.abs(c2 - 2)) * 1;
          }
        }
      }
      // 占棋盘上沿中点（原庙门）额外加分
      if (pieceAt(GATE) === player) score += 30;
    }
    return score;
  }

  // ---------------- AI：一步贪心（移植 findBestMove）----------------
  // 对所有己子 × 所有合法走步：模拟 → 评估 + 吃子×50 → 最高分。
  function findBestMove(player, game, mode17) {
    function pieceAt(p) { return game.pieceAt(p); }

    var bestScore = -Infinity;
    var bestMove = null;

    var myPositions = [];
    for (var r = 0; r < 5; r++) {
      for (var c = 0; c < 5; c++) {
        if (game.board[r][c] === player) myPositions.push({ r: r, c: c });
      }
    }
    var tk = ['top', 'left', 'center', 'right'];
    for (var i = 0; i < tk.length; i++) {
      if (game.temple[tk[i]] === player) myPositions.push(TEMPLE[tk[i]]);
    }
    // 17 子主将在庙中：只列庙内位置
    if (mode17 && player === 'main' && game.mainInTemple) {
      var filtered = [];
      for (var m = 0; m < myPositions.length; m++) {
        if (isInTempleInterior(myPositions[m]) && !isTempleGate(myPositions[m])) {
          filtered.push(myPositions[m]);
        }
      }
      myPositions = filtered;
    }

    var reserves = { red: game.redReserves, blue: game.blueReserves };

    for (var f = 0; f < myPositions.length; f++) {
      var from = myPositions[f];
      var moves = legalMoves(from, pieceAt, mode17);
      for (var t = 0; t < moves.length; t++) {
        var to = moves[t];
        // 模拟
        game.setPiece(player, to);
        game.setPiece(null, from);
        var score = evaluateBoard(player, pieceAt, reserves, mode17);
        var captured = checkCaptures(to, player, pieceAt, mode17);
        score += captured.length * 50;
        // 还原
        game.setPiece(null, to);
        game.setPiece(player, from);
        if (score > bestScore) { bestScore = score; bestMove = { from: from, to: to }; }
      }
    }
    return bestMove;
  }

  // ---------------- 对局状态机 ----------------
  // mode: 'm17'（17子·AI大将：玩家 10 士兵 vs AI 主将）
  //       'm18'（18子·人机对弈：玩家红方 vs AI 蓝方，上场5+备用4）
  // 常量与 iOS 一致：士兵败阈值 2、消极判负 20 手
  var SOLDIER_LOSE_THRESHOLD = 2;
  var SOLDIER_PASSIVE_LIMIT = 20;
  // 17 子士兵初始布局（庙门与主将活动线留空；左右对称）
  var INITIAL17_SOLDIERS = [
    [0, 0], [0, 4], [1, 2], [2, 1], [2, 3],
    [3, 0], [3, 4], [4, 0], [4, 2], [4, 4]
  ];

  function Game(mode) {
    this.mode = mode;
    // 17 模式（m17=AI大将 / m17vs16=大将对士兵）庙可用；AI 模式（m17/m18）才有 aiTurn
    this.mode17 = (mode === 'm17' || mode === 'm17vs16');
    this.isAI = (mode === 'm17' || mode === 'm18');
    this.reset();
  }

  Game.prototype.reset = function () {
    this.board = [];
    for (var r = 0; r < 5; r++) {
      this.board.push([null, null, null, null, null]);
    }
    this.temple = { top: null, left: null, center: null, right: null };
    this.gameOver = false;
    this.result = null;        // {winner: 'main'|'soldier'|'red'|'blue'|'draw', text}——绝对方，显示层按模式翻译
    this.selected = null;
    this.lastMove = null;
    this.mainInTemple = this.mode17;
    this.passiveCounter = 0;
    this.mobilityBaseline = Infinity;
    this.redReserves = 0;
    this.blueReserves = 0;
    this.currentPlayer = this.mode17 ? 'main' : 'red';
    this.message = '';

    // ---- 初始布局（与 iOS setup17Mode / setup18Mode 一致）----
    if (this.mode17) {
      // AI 主将居庙中心；士兵 10 枚按对称布局（庙门与主将活动线留空）
      this.temple.center = 'main';
      for (var i = 0; i < INITIAL17_SOLDIERS.length; i++) {
        var s = INITIAL17_SOLDIERS[i];
        if (!(s[0] === 0 && s[1] === 2)) this.board[s[0]][s[1]] = 'soldier';
      }
    } else {
      // 红方左列 col0、蓝方右列 col4 各 5 颗上场；备用各 4
      for (var r2 = 0; r2 < 5; r2++) {
        this.board[r2][0] = 'red';
        this.board[r2][4] = 'blue';
      }
      this.redReserves = 4;
      this.blueReserves = 4;
    }
  };

  Game.prototype.humanPlayer = function () { return this.mode17 ? 'soldier' : 'red'; };
  // AI 模式返回 AI 执子的方；双人对战返回 null（无 AI，双方轮流操作）
  Game.prototype.aiPlayer = function () {
    if (!this.isAI) return null;
    return this.mode17 ? 'main' : 'blue';
  };

  Game.prototype.pieceAt = function (p) {
    if (isOnBoard(p)) return this.board[p.r][p.c];
    var k = templeKeyOf(p);
    if (k) return this.temple[k];
    return null;
  };

  Game.prototype.setPiece = function (player, p) {
    if (isOnBoard(p)) { this.board[p.r][p.c] = player; return; }
    var k = templeKeyOf(p);
    if (k) this.temple[k] = player;
  };

  Game.prototype.countOf = function (player) {
    var n = 0;
    for (var r = 0; r < 5; r++) for (var c = 0; c < 5; c++) {
      if (this.board[r][c] === player) n++;
    }
    var tk = ['top', 'left', 'center', 'right'];
    for (var i = 0; i < tk.length; i++) {
      if (this.temple[tk[i]] === player) n++;
    }
    return n;
  };

  Game.prototype.mainPosition = function () {
    if (this.mainInTemple) {
      var tk = ['top', 'left', 'center', 'right'];
      for (var i = 0; i < tk.length; i++) {
        if (this.temple[tk[i]] === 'main') return TEMPLE[tk[i]];
      }
      return TEMPLE.center;
    }
    for (var r = 0; r < 5; r++) {
      for (var c = 0; c < 5; c++) {
        if (this.board[r][c] === 'main') return { r: r, c: c };
      }
    }
    return null;
  };

  // 士兵走完后：压缩主将活动空间则清零计时，否则累计；≥上限判士兵消极负
  Game.prototype.updateSoldierPassivity = function () {
    var pos = this.mainPosition();
    var mobility = pos ? legalMoves(pos, this.pieceAt.bind(this), this.mode17).length : 0;
    if (mobility < this.mobilityBaseline) {
      this.mobilityBaseline = mobility;
      this.passiveCounter = 0;
    } else {
      this.passiveCounter++;
    }
    if (this.passiveCounter >= SOLDIER_PASSIVE_LIMIT / 2) {
      return '（消极计时 ' + this.passiveCounter + '/' + SOLDIER_PASSIVE_LIMIT + '）';
    }
    return '';
  };

  Game.prototype.resetSoldierPassivity = function () {
    this.passiveCounter = 0;
    this.mobilityBaseline = Infinity;
  };

  // 17 子胜负判定（顺序与 iOS 一致）
  Game.prototype.checkWin17 = function () {
    var mode = this.mode;
    // 主将胜：士兵被吃光或兵力不足以围剿
    if (this.countOf('soldier') <= SOLDIER_LOSE_THRESHOLD) {
      this.gameOver = true;
      this.result = { winner: 'main', text: '主将胜：士兵已被吃光，兵力不足以完成围剿。' };
      return true;
    }
    // 士兵胜：主将困在庙中无法移动
    if (this.mainInTemple) {
      var mp = this.mainPosition();
      if (mp && !hasAnyLegalMove(mp, this.pieceAt.bind(this), true)) {
        this.gameOver = true;
        this.result = { winner: 'soldier', text: '士兵胜：主将被困在庙中，无法移动！' };
        return true;
      }
    }
    // 士兵胜：主将已出庙，但棋盘上所有主将棋子无路可走
    if (!this.mainInTemple && allBlocked('main', this.pieceAt.bind(this), true)) {
      this.gameOver = true;
      this.result = { winner: 'soldier', text: '士兵胜：主将已被围困，无路可走！' };
      return true;
    }
    // 主将胜：所有士兵无路可走
    if (allBlocked('soldier', this.pieceAt.bind(this), true)) {
      this.gameOver = true;
      this.result = { winner: 'main', text: '主将胜：士兵全部被堵死。' };
      return true;
    }
    // 主将胜：士兵长时间消极不应战
    if (this.passiveCounter >= SOLDIER_PASSIVE_LIMIT) {
      this.gameOver = true;
      this.result = { winner: 'main', text: '主将胜：士兵连续 ' + SOLDIER_PASSIVE_LIMIT + ' 手消极不应战。' };
      return true;
    }
    return false;
  };

  // 18 子胜负判定（顺序与 iOS 一致：判和 → 吃光 → 围困）
  // mover = 刚走完的一方；检查其对手是否被吃光/围困
  Game.prototype.checkWin18 = function (mover) {
    var redCount = this.countOf('red');
    var blueCount = this.countOf('blue');
    // 判和：双方场上都仅剩 1 颗（1v1 夹/挑都无法成立）
    if (redCount === 1 && blueCount === 1) {
      this.gameOver = true;
      this.result = { winner: 'draw', text: '和棋：双方各剩一子，势均力敌。' };
      return true;
    }
    var loser = OPP[mover];
    var loserCount = mover === 'red' ? blueCount : redCount;
    // 吃光：对手在场棋数为 0
    if (loserCount === 0) {
      this.gameOver = true;
      this.result = mover === 'red'
        ? { winner: 'red', text: '红方胜：蓝方九子全灭！' }
        : { winner: 'blue', text: '蓝方胜：红方九子全灭。' };
      return true;
    }
    // 围困：对手全部无路可走
    if (allBlocked(loser, this.pieceAt.bind(this), false)) {
      this.gameOver = true;
      this.result = mover === 'red'
        ? { winner: 'red', text: '红方胜：蓝方被围困，无路可走！' }
        : { winner: 'blue', text: '蓝方胜：红方被围困，无路可走。' };
      return true;
    }
    return false;
  };

  // 18 子补子：被吃方从备用补至本方起始列第一个空位；备用耗尽则真正损失
  Game.prototype.applyCaptures18 = function (captured, capturer) {
    if (!captured.length) return;
    var victim = OPP[capturer];
    for (var i = 0; i < captured.length; i++) {
      this.setPiece(null, captured[i]);
      var reserves = victim === 'red' ? this.redReserves : this.blueReserves;
      if (reserves <= 0) continue; // 备用已尽：真正损失
      var startCol = victim === 'red' ? 0 : 4;
      var spot = null;
      for (var r = 0; r < 5; r++) {
        if (this.board[r][startCol] === null) { spot = { r: r, c: startCol }; break; }
      }
      if (!spot) spot = captured[i]; // 兜底：补回被吃原位
      if (victim === 'red') this.redReserves--; else this.blueReserves--;
      this.setPiece(victim, spot);
    }
  };

  // 17 子主将吃子（直接提子制：被吃即少一枚）
  Game.prototype.applyCaptures17 = function (captured) {
    for (var i = 0; i < captured.length; i++) this.setPiece(null, captured[i]);
  };

  // 落子点击入口（AI 模式 = 玩家操作，返回是否触发 AI 回合；
  // 双人对战 = 同屏双方轮流操作，恒返回 false）
  Game.prototype.playerClick = function (pos) {
    if (this.gameOver) return false;
    // AI 模式：当前回合必须是玩家；双人对战：当前回合的人直接操作
    var actor = this.isAI ? this.humanPlayer() : this.currentPlayer;
    if (this.currentPlayer !== actor) return false;

    var mode17 = this.mode17;
    var pieceAt = this.pieceAt.bind(this);
    var sideName = { main: '主将方', soldier: '士兵方', red: '红方', blue: '蓝方' };

    if (this.selected) {
      var from = this.selected;
      if (same(from, pos)) { this.selected = null; this.message = '已取消选中。'; return false; }
      if (pieceAt(from) !== actor) { this.selected = null; return false; }
      if (pieceAt(pos)) { this.message = '该位置已有棋子。'; this.selected = null; return false; }
      if (!canMove(from, pos, pieceAt, mode17)) {
        this.message = '走不到这里：只能在连线上滑行，且中间不能有棋子。';
        this.selected = null;
        return false;
      }
      this.setPiece(actor, pos);
      this.setPiece(null, from);
      this.selected = null;
      this.lastMove = { from: from, to: pos };

      if (mode17) {
        // 主将走到棋盘 → 出庙（与 iOS 一致：出庙后走「全堵」分支，不再回「困庙」判定）
        if (actor === 'main' && this.mainInTemple && isOnBoard(pos)) this.mainInTemple = false;
        // 主将可吃士兵；士兵不能吃主将（checkCaptures 对 soldier 恒返回空）
        var captured = checkCaptures(pos, actor, pieceAt, true);
        if (captured.length) {
          this.applyCaptures17(captured);
          this.resetSoldierPassivity();
          this.message = sideName[actor] + '吃掉 ' + captured.length + ' 颗棋子！';
        }
        if (actor === 'soldier') {
          var hint = this.updateSoldierPassivity();
          if (this.checkWin17()) return false;
          this.currentPlayer = 'main';
          this.message = this.isAI ? '轮到 AI 主将' + hint : '轮到主将方' + hint;
          return this.isAI;
        } else {
          if (this.checkWin17()) return false;
          this.currentPlayer = 'soldier';
          this.message = this.isAI ? '轮到你走士兵。' : '轮到士兵方。';
          return false;
        }
      } else {
        var captured18 = checkCaptures(pos, actor, pieceAt, false);
        if (captured18.length) this.applyCaptures18(captured18, actor);
        if (this.checkWin18(actor)) return false;
        this.currentPlayer = OPP[actor];
        this.message = captured18.length
          ? sideName[actor] + '吃掉 ' + captured18.length + ' 颗棋子！'
          : '轮到' + sideName[this.currentPlayer] + '。';
        return this.isAI;
      }
    }

    // 无选中：尝试选中当前回合方的棋子
    if (pieceAt(pos) === actor) {
      this.selected = pos;
      var selName = { main: '主将', soldier: '士兵', red: '红子', blue: '蓝子' };
      this.message = '已选中' + selName[actor] + '：沿线滑行到高亮点。';
    } else {
      this.message = '轮到' + sideName[actor] + '：请选择自己的棋子。';
    }
    return false;
  };

  // AI 回合（同步执行；UI 层负责延迟与提示）
  Game.prototype.aiTurn = function () {
    if (this.gameOver) return;
    var ai = this.aiPlayer();
    if (this.currentPlayer !== ai) return;
    var mode17 = this.mode17;
    var pieceAt = this.pieceAt.bind(this);

    var move = findBestMove(ai, this, mode17);
    if (!move) {
      this.gameOver = true;
      if (mode17) {
        this.result = { winner: 'soldier', text: '士兵胜：AI 主将无路可走！' };
      } else {
        this.result = { winner: 'red', text: '红方胜：AI 无路可走！' };
      }
      return;
    }

    this.setPiece(ai, move.to);
    this.setPiece(null, move.from);
    this.lastMove = { from: move.from, to: move.to };

    if (mode17) {
      // 主将从庙内走到棋盘 → 更新 mainInTemple（与 iOS 一致）
      if (this.mainInTemple && isOnBoard(move.to)) this.mainInTemple = false;
      var captured = checkCaptures(move.to, ai, pieceAt, true);
      if (captured.length) {
        this.applyCaptures17(captured);
        this.resetSoldierPassivity();
        this.message = 'AI 主将吃掉 ' + captured.length + ' 颗士兵！';
      } else {
        this.message = 'AI 主将已走。';
      }
      if (this.checkWin17()) return;
      this.currentPlayer = 'soldier';
      this.message = '轮到你走士兵。';
    } else {
      var captured18 = checkCaptures(move.to, ai, pieceAt, false);
      if (captured18.length) this.applyCaptures18(captured18, ai);
      this.message = captured18.length
        ? 'AI 蓝方吃掉 ' + captured18.length + ' 颗红子！'
        : '轮到你走红子。';
      if (this.checkWin18(ai)) return;
      this.currentPlayer = 'red';
    }
  };

  // ---------------- 导出 ----------------
  var Engine = {
    GATE: GATE,
    TEMPLE: TEMPLE,
    TEMPLE_POINTS: TEMPLE_POINTS,
    LINES: LINES,
    OPP: OPP,
    SOLDIER_LOSE_THRESHOLD: SOLDIER_LOSE_THRESHOLD,
    SOLDIER_PASSIVE_LIMIT: SOLDIER_PASSIVE_LIMIT,
    INITIAL17_SOLDIERS: INITIAL17_SOLDIERS,
    same: same,
    isOnBoard: isOnBoard,
    isInTempleInterior: isInTempleInterior,
    isTempleGate: isTempleGate,
    isPlayable: isPlayable,
    legalMoves: legalMoves,
    canMove: canMove,
    collinearTriples: collinearTriples,
    checkCaptures: checkCaptures,
    allBlocked: allBlocked,
    evaluateBoard: evaluateBoard,
    findBestMove: findBestMove,
    Game: Game
  };

  root.FiveHorseEngine = Engine;
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;

})(typeof window !== 'undefined' ? window : globalThis);
