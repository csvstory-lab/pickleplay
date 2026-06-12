-- posts.category: create.html 14개 슬러그로 CHECK 제약 갱신
-- (driving, food, love, balance, fashion, drama, fandom, games, pets, sports, spending, mind, kpop, mystery)

ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_category_check;

ALTER TABLE public.posts
  ADD CONSTRAINT posts_category_check CHECK (
    category IN (
      'driving',
      'food',
      'love',
      'balance',
      'fashion',
      'drama',
      'fandom',
      'games',
      'pets',
      'sports',
      'spending',
      'mind',
      'kpop',
      'mystery'
    )
  );

COMMENT ON COLUMN public.posts.category IS '카테고리 슬러그: driving/food/love/balance/fashion/drama/fandom/games/pets/sports/spending/mind/kpop/mystery';
