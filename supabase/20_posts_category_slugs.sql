-- posts.category: create.html 15개 슬러그로 CHECK 제약 갱신
-- (driving … mystery, worldcup)

DO $$
DECLARE
  legacy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO legacy_count
  FROM public.posts
  WHERE category IS NULL
     OR category NOT IN (
       'driving', 'food', 'love', 'balance', 'fashion', 'drama',
       'fandom', 'games', 'pets', 'sports', 'worldcup', 'spending',
       'mind', 'kpop', 'mystery'
     );

  IF legacy_count > 0 THEN
    RAISE EXCEPTION
      'posts.category에 레거시/미지원 값이 %건 남아 있습니다. Table Editor에서 정리 후 다시 실행하세요.',
      legacy_count;
  END IF;
END $$;

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
