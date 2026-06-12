-- 이미 20_posts_category_slugs.sql(14개) 적용 DB → worldcup 슬러그만 추가할 때 실행

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
      'worldcup',
      'spending',
      'mind',
      'kpop',
      'mystery'
    )
  );

COMMENT ON COLUMN public.posts.category IS '카테고리 슬러그: driving/food/love/balance/fashion/drama/fandom/games/pets/sports/worldcup/spending/mind/kpop/mystery';
