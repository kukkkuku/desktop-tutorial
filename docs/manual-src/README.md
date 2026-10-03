# 매뉴얼 생성기

`public/manual/*.html`(사용 매뉴얼)을 만드는 스크립트. 매뉴얼 HTML은 손으로 고치지 않고 여기를 고쳐 다시 만든다.

- `chapters.py` · `chapters3.py`: 장별 내용(글 · 그림 · 단계). 내용은 주로 `chapters3.py`를 고친다.
- `build.py`: 위 내용을 `ref-index.html`(디자인 틀)에 넣어 `public/manual/`에 쓴다.
- 그림: `public/manual/assets/*.png` -- 가짜 데이터로 찍은 화면만 넣는다(실제 시트 · 인사 정보 금지).

만들기(저장소 루트에서):

```
python3 docs/manual-src/build.py
```

고칠 내용은 `docs/MANUAL-TODO.md`에 모아 두었다가 한 번에 반영한다.
