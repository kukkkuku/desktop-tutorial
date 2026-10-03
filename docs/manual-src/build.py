import os
HERE = os.path.dirname(os.path.abspath(__file__))
ref=open(os.path.join(HERE, 'ref-index.html')).read()
css=ref[ref.index('<style>'):ref.index('</style>')+8]
css=css.replace('</style>','.shot.half{max-width:760px}.kbd{font:600 11px/1.5 ui-monospace,Menlo,monospace;padding:1px 6px;border:1px solid #d0d5dd;border-bottom-width:2px;border-radius:5px;background:#fff;white-space:nowrap}.faq{display:grid;gap:10px}.faq details{border:1px solid var(--line);border-radius:10px;padding:13px 15px;font-size:13px}.faq summary{cursor:pointer;font-weight:700}.faq p{margin:8px 0 0;color:var(--muted);line-height:1.65}.feat{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:18px}.feat div{border:1px solid var(--line);border-radius:10px;padding:13px 14px;font-size:12.5px;line-height:1.6;color:var(--muted)}.feat b{display:block;margin-bottom:2px;color:var(--ink);font-size:13px}.steps+.shot,.shot+.steps{margin-top:22px}@media(max-width:720px){.feat{grid-template-columns:1fr}}</style>')
css=css.replace('.logo{display:grid;width:32px;height:32px;place-items:center;border-radius:9px;background:var(--ink);color:#fff;font-size:12px}','.logo{display:block;width:32px;height:32px;flex:0 0 32px}')
def shot(src, bar, alt, half=False):
    cls = 'shot half' if half else 'shot'
    return f'<div class="{cls}"><div class="shot-bar"><i class="dot"></i><i class="dot"></i><i class="dot"></i>{bar}</div><img src="assets/{src}" alt="{alt}" loading="lazy"></div>'
def step(n, h, p):
    return f'<div class="step"><span class="step-no">{n}</span><div><h3>{h}</h3><p>{p}</p></div></div>'
def note(t, s):
    return f'<div class="note"><b>{t}</b><span>{s}</span></div>'
def chapter(id, no, title, lead, badge, body, key):
    b = f'<span class="badge">{badge}</span>' if badge else ''
    return f'<section id="{id}" class="chapter searchable" data-title="{key}"><div class="chapter-head"><div><div class="eyebrow">Chapter {no:02d}</div><h2>{title}</h2><p class="lead">{lead}</p></div>{b}</div>{body}</section>'
def feats(items):
    return '<div class="feat">' + ''.join(f'<div><b>{a}</b>{b}</div>' for a, b in items) + '</div>'
K = lambda s: f'<span class="kbd">{s}</span>'
# 이미지를 늦게 읽으면(lazy) 장 이동 뒤에 위 그림이 늘어나 자리가 어긋난다 -- 바로 읽는다
def shot(src, bar, alt, half=False):
    cls = 'shot half' if half else 'shot'
    return f'<div class="{cls}"><div class="shot-bar"><i class="dot"></i><i class="dot"></i><i class="dot"></i>{bar}</div><img src="assets/{src}" alt="{alt}"></div>'
exec(open(os.path.join(HERE, 'chapters3.py')).read())
script = ref[ref.index('<script>'):ref.index('</script>')+9]
# 주소의 #장으로 열면: 그림을 다 읽은 뒤 그 장으로 다시 맞추고, 목차도 그 장을 표시(스크롤 감지가 늦게 덮어쓰지 않게 잠깐 고정)
script += """<script>(function(){const links=[...document.querySelectorAll('nav a')];let lock=0;const mark=h=>links.forEach(a=>a.classList.toggle('active',a.hash===h));const go=()=>{const h=location.hash;const el=h&&document.getElementById(h.slice(1));if(!el)return;el.scrollIntoView();mark(h);lock=Date.now()+600};const mo=new MutationObserver(()=>{if(Date.now()<lock&&location.hash)mark(location.hash)});links.forEach(a=>mo.observe(a,{attributes:true,attributeFilter:['class']}));go();window.addEventListener('load',go);window.addEventListener('hashchange',go)})()</script>"""
# 앱 안 패널(iframe)에서 열리면 창 닫기 버튼을 숨긴다
embed = "<script>if(window.self!==window.top)document.documentElement.classList.add('embed')</script>"
# 앱 디자인 시스템 색(tailwind.config: accent #007AFF · label #1D1D1F/#6E6E73/#AEAEB2 · window #F5F5F7 · success #28A745)
for a, b in [('--ink:#111827', '--ink:#1D1D1F'), ('--muted:#667085', '--muted:#6E6E73'), ('--line:#e5e7eb', '--line:#E5E5EA'), ('--soft:#f8fafc', '--soft:#F5F5F7'),
             ('--accent:#c05621', '--accent:#007AFF'), ('--accent-soft:#fff7ed', '--accent-soft:#E8F1FF'), ('background:#f5f6f8', 'background:#F5F5F7'),
             ('#c0562118', '#007AFF1f'), ('#fed7aa', '#BFD8FF'), ('#7c2d12', '#0066D6'), ('#d0d5dd', '#D1D1D6'), ('#98a2b3', '#AEAEB2'), ('#475467', '#6E6E73'),
             ('#f2f4f7', '#F2F2F7'), ('#344054', '#1D1D1F'), ('#ecfdf3', '#E9F7EC'), ('#059669', '#28A745')]:
    assert a in css, a
    css = css.replace(a, b)
css2 = css.replace('</style>', '.embed .topbar .close{display:none}.chapter .eyebrow b{color:var(--accent);font-weight:700}.book-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:24px}.book-cards a{display:block;border:1px solid var(--line);border-radius:14px;padding:22px;text-decoration:none;color:inherit;background:#fff}.book-cards a:hover{box-shadow:0 4px 16px rgba(0,0,0,.08)}.book-cards h3{margin:0 0 6px;font-size:18px}.book-cards p{margin:0;color:var(--muted);font-size:13px;line-height:1.6}@media(max-width:720px){.book-cards{grid-template-columns:1fr}}</style>')

def chapter2(c, no):
    id, sec, title, lead, badge, body, key = c
    b = f'<span class="badge">{badge}</span>' if badge else ''
    return f'<section id="{id}" class="chapter searchable" data-title="{key}"><div class="chapter-head"><div><div class="eyebrow"><b>{sec}</b> · Chapter {no:02d}</div><h2>{title}</h2><p class="lead">{lead}</p></div>{b}</div>{body}</section>'

def page(fname, title, hero, chs, other):
    navs = []
    last = None
    for i, c in enumerate(chs):
        act = ' class="active"' if i == 0 else ''
        navs.append(f'<a{act} href="#{c[0]}"><span class="nav-no">{i+1:02d}</span>{c[2]}</a>')
    nav = ''.join(navs)
    body = ''.join(chapter2(c, i+1) for i, c in enumerate(chs))
    html = f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title>
{embed}
{css2}
</head>
<body>
<header class="topbar" id="top"><div><div class="brand"><img class="logo" src="../favicon.svg" alt=""><span>{title}</span></div><label class="search"><span>⌕</span><input id="search" type="search" placeholder="매뉴얼에서 찾기" aria-label="매뉴얼 검색"></label><button class="close" onclick="window.close()">창 닫기</button></div></header>
<div class="layout">
<aside><div class="eyebrow">Contents</div><h2>챕터 바로가기</h2><nav id="chapter-nav">{nav}</nav><p class="privacy">{other}<br><br>화면의 인물·과제·조직 정보는 모두 설명용 가상 데이터입니다.</p></aside>
<main id="content">
{hero}
{body}
<p id="empty" class="empty">검색 결과가 없습니다.</p>
</main>
</div>
<a class="top" href="#top" aria-label="맨 위로">↑</a>
{script}
</body>
</html>
"""
    open('public/manual/' + fname, 'w').write(html)
    return len(html)

hero_t = """<section class="hero searchable" data-title="빠르게 시작 과제 입력"><div><div class="eyebrow">Quick start</div><h1>시트를 연결하고,<br>한 해 추진현황을 함께 채웁니다.</h1><p>관리자가 권한 시트에 역할과 팀별 추진현황 시트를 적어 두면, 팀원은 로그인해서 공유된 시트를 불러와 과제와 일정을 입력하고 구글시트에 저장합니다. 진척률은 일정 칸으로 자동 계산됩니다.</p></div>
<div class="hero-flow"><div class="hero-step"><b>1</b>준비 · 권한 시트 · 추진현황 시트</div><div class="hero-step"><b>2</b>로그인 · 공유된 시트 연결</div><div class="hero-step"><b>3</b>입력하기 · 구글시트에 저장</div></div></section>"""
hero_p = """<section class="hero searchable" data-title="빠르게 시작 성과관리"><div><div class="eyebrow">Quick start</div><h1>데이터를 먼저 준비하고,<br>메뉴 순서대로 평가합니다.</h1><p>추진현황 시트 · 인사기록카드 · 이전 성과 엑셀을 준비해 두면, 팀장은 과제를 가져와 과제관리에서 평가 대상 · 성과등급 · 목표/성과를 넣고, 피어리뷰 · 평가하기 · 평가결과 · 면담으로 이어 갑니다.</p></div>
<div class="hero-flow"><div class="hero-step"><b>1</b>준비 · 시트 · 인사기록카드 · 이전 성과</div><div class="hero-step"><b>2</b>평가 목록 · 새 평가 시작</div><div class="hero-step"><b>3</b>과제관리 · 팀원관리 · 평가하기 · 평가결과 · 면담</div></div></section>"""
print(page('tasks.html', '페이스 · 과제 입력 매뉴얼', hero_t, TASKS, '<a href="perf.html">성과관리 매뉴얼 →</a>'))
print(page('perf.html', '페이스 · 성과관리 매뉴얼', hero_p, PERF, '<a href="tasks.html">과제 입력 매뉴얼 →</a>'))

index = f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>페이스 사용 매뉴얼</title>
{embed}
{css2}
</head>
<body>
<header class="topbar" id="top"><div><div class="brand"><img class="logo" src="../favicon.svg" alt=""><span>페이스 사용 매뉴얼</span></div><button class="close" onclick="window.close()">창 닫기</button></div></header>
<main style="max-width:880px;margin:0 auto;padding:40px 20px">
<section class="hero"><div><div class="eyebrow">Manuals</div><h1>어떤 일을 하시나요?</h1><p>과제 입력은 연구소 모두가, 성과관리는 팀장이 씁니다. 각 매뉴얼은 준비할 데이터부터 순서대로 안내합니다.</p></div></section>
<div class="book-cards">
<a href="tasks.html"><h3>과제 입력 매뉴얼</h3><p>권한 시트 · 구글시트 연결(관리자) → 로그인 → 공유된 시트 불러오기 → 연도 · 「파일」 메뉴 → 추진현황 입력하기 · 구글시트에 저장 → 진척률</p></a>
<a href="perf.html"><h3>성과관리 매뉴얼</h3><p>준비(과제 가져올 곳 · 인사기록카드 · 이전 성과) → 평가 목록 · 새 평가 시작 → 과제관리(평가 대상 · 성과등급 · 목표/성과) → 피어리뷰 · 평가하기 → 평가결과 · 리포트 → 승진 시뮬레이션 · 면담 · 데이터 백업</p></a>
</div>
<p class="privacy" style="margin-top:28px">화면의 인물·과제·조직 정보는 모두 설명용 가상 데이터입니다.</p>
</main>
</body>
</html>
"""
open('public/manual/index.html', 'w').write(index)
print(len(index))
