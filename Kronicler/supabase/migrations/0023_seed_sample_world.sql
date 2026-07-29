-- Kronicler — the example world (Sherlock Holmes).
-- A public-domain, instantly-recognisable world that lights up every feature:
-- two series, a dated timeline, an evolving relationship graph, and — the point —
-- concealment + belief (dramatic irony). New accounts are seeded with a copy;
-- there is also a re-add RPC. Prose bodies are original synopses, not source text.

alter table worlds add column if not exists is_sample boolean not null default false;

-- Internal builder. SECURITY DEFINER so it can run under pg_cron/signup context
-- and bypass RLS while inserting for a specific owner. Reuses append_pairwise_state.
create or replace function _seed_sample_world(p_owner uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  w uuid := gen_random_uuid();
  seg1 uuid := gen_random_uuid();  seg2 uuid := gen_random_uuid();
  -- entities
  e_holmes uuid := gen_random_uuid(); e_watson uuid := gen_random_uuid();
  e_hudson uuid := gen_random_uuid(); e_lestrade uuid := gen_random_uuid();
  e_mycroft uuid := gen_random_uuid(); e_moriarty uuid := gen_random_uuid();
  e_irene uuid := gen_random_uuid(); e_mary uuid := gen_random_uuid();
  e_hope uuid := gen_random_uuid(); e_drebber uuid := gen_random_uuid();
  e_221b uuid := gen_random_uuid(); e_yard uuid := gen_random_uuid();
  e_reich uuid := gen_random_uuid(); e_irr uuid := gen_random_uuid();
  -- chapters
  c1 uuid := gen_random_uuid(); c2 uuid := gen_random_uuid(); c3 uuid := gen_random_uuid();
  c4 uuid := gen_random_uuid(); c5 uuid := gen_random_uuid(); c6 uuid := gen_random_uuid();
  c7 uuid := gen_random_uuid(); c8 uuid := gen_random_uuid(); c9 uuid := gen_random_uuid();
  c10 uuid := gen_random_uuid(); c11 uuid := gen_random_uuid(); c12 uuid := gen_random_uuid();
  c13 uuid := gen_random_uuid(); c14 uuid := gen_random_uuid(); c15 uuid := gen_random_uuid();
  c16 uuid := gen_random_uuid(); c17 uuid := gen_random_uuid(); c18 uuid := gen_random_uuid();
  -- relationship types (resolved after insert)
  t_ally uuid; t_allied uuid; t_enemy uuid; t_rival uuid; t_family uuid; t_mentor uuid; t_located uuid;
  t_inlove uuid; t_kills uuid; t_deduces uuid; t_admires uuid; t_parted uuid; t_defeated uuid;
  v_belief uuid;
  dn constant int := 360; -- default calendar days/year
begin
  -- world (insert fires the starter-vocabulary trigger)
  insert into worlds(id, owner_id, name, is_sample, known_start_year, known_end_year)
    values (w, p_owner, 'The Sherlock Holmes Casebook', true, 1878, 1895);

  -- two series
  insert into segments(id, world_id, kind, name, seg_order, color) values
    (seg1, w, 'Book', 'A Study in Scarlet', 1, 'azure'),
    (seg2, w, 'Book', 'The Adventures of Sherlock Holmes', 2, 'rust');

  -- entities
  insert into entities(id, world_id, type, title, aliases, body) values
    (e_holmes,w,'Character','Sherlock Holmes','{Holmes,"Mr Holmes"}','The world''s first consulting detective. Cold reason, restless mind, a habit of explaining the obvious only after the fact.'),
    (e_watson,w,'Character','Dr John Watson','{Watson,"John Watson"}','Army doctor invalided home from Afghanistan. Holmes''s flatmate, chronicler, and conscience.'),
    (e_hudson,w,'Character','Mrs Hudson','{}','Landlady of 221B Baker Street. Long-suffering and loyal; keeps the household running.'),
    (e_lestrade,w,'Character','Inspector Lestrade','{Lestrade}','A Scotland Yard detective — dogged but conventional, and slowly won over by Holmes.'),
    (e_mycroft,w,'Character','Mycroft Holmes','{Mycroft}','Holmes''s older, cleverer, lazier brother. Quietly is a corner of the British government.'),
    (e_moriarty,w,'Character','Professor Moriarty','{Moriarty}','The Napoleon of crime — Holmes''s intellectual equal and mortal enemy.'),
    (e_irene,w,'Character','Irene Adler','{Irene,"The Woman"}','Opera singer and adventuress. The one person ever to outwit Holmes.'),
    (e_mary,w,'Character','Mary Morstan','{Mary}','A governess who becomes Watson''s wife.'),
    (e_hope,w,'Character','Jefferson Hope','{}','A London cabman with a buried past and a debt of vengeance to collect.'),
    (e_drebber,w,'Character','Enoch Drebber','{}','A man found dead in an empty house off the Brixton Road.'),
    (e_221b,w,'Place','221B Baker Street','{"Baker Street"}','The famous first-floor lodgings Holmes and Watson share.'),
    (e_yard,w,'Place','Scotland Yard','{}','Headquarters of the Metropolitan Police.'),
    (e_reich,w,'Place','Reichenbach Falls','{}','A great torrent in the Swiss Alps — the site of the final reckoning.'),
    (e_irr,w,'Faction','The Baker Street Irregulars','{Irregulars}','A ragged band of street children who see everything, for a shilling a day.');

  -- custom relationship types (seeded vocabulary already gave us ally/enemy/etc.)
  insert into relationship_types(world_id, label, valence, is_ambient) values
    (w,'in love with','bond',false),
    (w,'kills','hostile',false),
    (w,'deduces the truth about','neutral',false),
    (w,'admires','bond',false),
    (w,'parted by death','hostile',false),
    (w,'outfoxed by','obligation',false)
  on conflict (world_id, label) do nothing;

  select id into t_ally     from relationship_types where world_id=w and label='ally';
  select id into t_allied   from relationship_types where world_id=w and label='allied with';
  select id into t_enemy    from relationship_types where world_id=w and label='enemy of';
  select id into t_rival    from relationship_types where world_id=w and label='rival';
  select id into t_family   from relationship_types where world_id=w and label='family';
  select id into t_mentor   from relationship_types where world_id=w and label='mentor of';
  select id into t_located  from relationship_types where world_id=w and label='located in';
  select id into t_inlove   from relationship_types where world_id=w and label='in love with';
  select id into t_kills    from relationship_types where world_id=w and label='kills';
  select id into t_deduces  from relationship_types where world_id=w and label='deduces the truth about';
  select id into t_admires  from relationship_types where world_id=w and label='admires';
  select id into t_parted   from relationship_types where world_id=w and label='parted by death';
  select id into t_defeated from relationship_types where world_id=w and label='outfoxed by';

  -- chapters: 'day' precision → day_num_start = year*360 + (month-1)*30 + (day-1)
  insert into chapters(id, world_id, segment_id, title, manuscript_order, planned, body,
                       time_year, time_month, time_day, time_precision, day_num_start, day_num_end,
                       story_time_ref, story_time_label) values
    (c1, w, seg1,'Mr Sherlock Holmes',1,false,'Invalided home from the war, Watson is introduced to a singular man who wants a flatmate and studies bloodstains for a hobby.',1881,1,4,'day',1881*dn+0*30+3,1881*dn+0*30+3,1881,'4 January 1881'),
    (c2, w, seg1,'The Science of Deduction',2,false,'Holmes lays out his method — that a life story can be read from a fingernail or a coat-cuff — and Watson learns his trade is real.',1881,1,6,'day',1881*dn+0*30+5,1881*dn+0*30+5,1881,'6 January 1881'),
    (c3, w, seg1,'The Lauriston Garden Mystery',3,false,'A corpse in an empty house, no wound, and the word RACHE scrawled in blood. Lestrade and Gregson are baffled; Holmes is delighted.',1881,3,4,'day',1881*dn+2*30+3,1881*dn+2*30+3,1881,'4 March 1881'),
    (c4, w, seg1,'What John Rance Had to Tell',4,false,'A constable''s account and the Irregulars'' legwork turn a drunk on the pavement into the first real thread.',1881,3,5,'day',1881*dn+2*30+4,1881*dn+2*30+4,1881,'5 March 1881'),
    (c5, w, seg1,'Our Advertisement Brings a Visitor',5,false,'A ring, an advertisement, and an old woman who is not what she seems.',1881,3,6,'day',1881*dn+2*30+5,1881*dn+2*30+5,1881,'6 March 1881'),
    (c6, w, seg1,'Tobias Gregson Shows What He Can Do',6,false,'The Yard makes a confident arrest. It is the wrong man, confidently made.',1881,3,7,'day',1881*dn+2*30+6,1881*dn+2*30+6,1881,'7 March 1881'),
    (c7, w, seg1,'Light in the Darkness',7,false,'From a cab and a pair of pills, Holmes reconstructs the whole chain and names the killer before the Yard has finished its tea.',1881,3,8,'day',1881*dn+2*30+7,1881*dn+2*30+7,1881,'8 March 1881'),
    (c8, w, seg1,'The Country of the Saints',8,true,'(Planned) The long American backstory — a forced marriage, a death on the plains, and the origin of a twenty-year vengeance.',null,null,null,null,null,null,null,null),
    (c9, w, seg1,'A Continuation of the Reminiscences',9,false,'Back in London, the threads tie: the cabman, the ring, and the debt that drove it all.',1881,3,10,'day',1881*dn+2*30+9,1881*dn+2*30+9,1881,'10 March 1881'),
    (c10,w, seg1,'The Conclusion',10,false,'Jefferson Hope confesses. Holmes explains the method; Lestrade takes the credit; Watson decides to write it down.',1881,3,12,'day',1881*dn+2*30+11,1881*dn+2*30+11,1881,'12 March 1881'),
    (c11,w, seg2,'A Scandal in Bohemia',11,false,'A king, a photograph, and Irene Adler — who sees through the disguise, keeps the picture, and leaves Holmes beaten and admiring.',1888,3,20,'day',1888*dn+2*30+19,1888*dn+2*30+19,1888,'20 March 1888'),
    (c12,w, seg2,'The Red-Headed League',12,false,'An absurd society pays a pawnbroker to copy the encyclopaedia — a screen for a tunnel toward a bank vault.',1888,6,27,'day',1888*dn+5*30+26,1888*dn+5*30+26,1888,'27 June 1888'),
    (c13,w, seg2,'The Boscombe Valley Mystery',13,false,'A son accused of his father''s murder; an old secret from the goldfields that the true killer would kill again to keep.',1889,6,8,'day',1889*dn+5*30+7,1889*dn+5*30+7,1889,'8 June 1889'),
    (c14,w, seg2,'The Five Orange Pips',14,false,'A letter, five seeds, and a death sentence posted across an ocean by a society that does not forgive.',1889,9,22,'day',1889*dn+8*30+21,1889*dn+8*30+21,1889,'22 September 1889'),
    (c15,w, seg2,'The Man with the Twisted Lip',15,false,'A respectable man vanishes into an opium den; the beggar in his place is a secret worth more than the truth.',1889,11,19,'day',1889*dn+10*30+18,1889*dn+10*30+18,1889,'19 November 1889'),
    (c16,w, seg2,'The Adventure of the Speckled Band',16,false,'A stepfather, a locked room, a whistle in the night, and a threat that comes down the bell-rope.',1890,4,6,'day',1890*dn+3*30+5,1890*dn+3*30+5,1890,'6 April 1890'),
    (c17,w, seg2,'The Final Problem',17,false,'Moriarty at last. A chase across Europe ends above the Reichenbach Falls — and the world is told that Sherlock Holmes is dead.',1891,5,4,'day',1891*dn+4*30+3,1891*dn+4*30+3,1891,'4 May 1891'),
    (c18,w, seg2,'The Empty House',18,true,'(Planned) Three years on, a dead man walks back into 221B. Where Holmes has been, and why, is the secret that carries the whole return.',null,null,null,null,null,null,null,null);

  -- relationships + states (append_pairwise_state finds-or-creates the pair''s
  -- relationship, then appends). Multiple states per pair = an evolving history.
  perform append_pairwise_state(w, e_holmes, e_watson, t_ally,    c1,  'They take the rooms at Baker Street together.', null);
  perform append_pairwise_state(w, e_holmes, e_watson, t_allied,  c3,  'Watson is pulled into his first case.', null);
  perform append_pairwise_state(w, e_holmes, e_watson, t_allied,  c11, 'By now an established partnership — the detective and his biographer.', null);
  perform append_pairwise_state(w, e_holmes, e_hudson, t_allied,  c1,  'She lets them the rooms and tolerates the revolver practice.', null);
  perform append_pairwise_state(w, e_holmes, e_221b,   t_located, c1,  null, null);
  perform append_pairwise_state(w, e_watson, e_221b,   t_located, c1,  null, null);
  perform append_pairwise_state(w, e_lestrade, e_yard, t_located, c3,  null, null);

  perform append_pairwise_state(w, e_holmes, e_lestrade, t_rival,  c3,  'Lestrade doubts the amateur with the magnifying glass.', null);
  perform append_pairwise_state(w, e_holmes, e_lestrade, t_allied, c10, 'Grudging respect, once Holmes hands him the killer.', null);

  -- concealment showcase: the murder is known to Holmes/reader but hidden from the Yard
  perform append_pairwise_state(w, e_hope, e_drebber, t_kills, c3,  'Drebber is found dead; the word RACHE in blood.', array[e_lestrade, e_watson]);
  perform append_pairwise_state(w, e_holmes, e_hope,  t_deduces, c7, 'Holmes reconstructs the killer from a cab and two pills.', null);
  perform append_pairwise_state(w, e_hope, e_drebber, t_kills, c10, 'Hope confesses: a revenge two decades in the making. The concealment lifts.', null);

  perform append_pairwise_state(w, e_holmes, e_irr,     t_mentor, c4,  'The Irregulars comb the city for one particular cab.', null);
  perform append_pairwise_state(w, e_holmes, e_mycroft, t_family, c11, 'His brother — and his better at pure armchair deduction.', null);

  -- Irene: rivalry turning to admiration, in one chapter
  perform append_pairwise_state(w, e_holmes, e_irene, t_rival,   c11, 'She anticipates his every move.', null);
  perform append_pairwise_state(w, e_holmes, e_irene, t_admires, c11, 'Beaten fairly, he keeps her photograph. Always, to him, the woman.', null);

  -- Watson & Mary: love becoming marriage
  perform append_pairwise_state(w, e_watson, e_mary, t_inlove, c13, 'Watson is quite plainly smitten.', null);
  perform append_pairwise_state(w, e_watson, e_mary, t_family, c15, 'They marry; Watson moves out of Baker Street.', null);

  -- the irony engine: the Reichenbach truth, concealed; the world''s belief, held
  perform append_pairwise_state(w, e_holmes, e_moriarty, t_enemy,    c17, 'Two great minds, at last set directly against each other.', null);
  perform append_pairwise_state(w, e_holmes, e_moriarty, t_defeated, c17, 'At the Falls Holmes prevails — but lets the world believe he fell too.', array[e_watson, e_lestrade, e_hudson]);
  v_belief := append_pairwise_state(w, e_holmes, e_moriarty, t_parted, c17, 'Watson believes both men went over the Reichenbach Falls together, locked in a final grip.', null);
  update relationship_states set known_by = jsonb_build_object('believed_by', to_jsonb(array[e_watson]::uuid[])) where id = v_belief;

  perform append_pairwise_state(w, e_holmes, e_reich, t_located, c17, null, null);

  -- planning board (one secret, one tagged, one planned beat)
  insert into notes(world_id, body, is_secret, x, y, w, h, entity_ids) values
    (w,'Holmes''s method, every case: notice the trifle, deduce the whole, reveal the chain last. Each solution is a small resurrection of the obvious.', false, 80, 80, 250, 150, '{}'),
    (w,'SPOILER — Holmes survives Reichenbach. Three years in hiding while he dismantles Moriarty''s network. Reveal in The Empty House. Keep it out of Watson''s point of view until then.', true, 360, 80, 270, 160, array[e_holmes]),
    (w,'Irene Adler is always "the woman" — the only mind to outrun his. Keep her offstage after Bohemia so the legend holds.', false, 80, 270, 250, 140, array[e_irene]);
  insert into notes(world_id, body, is_secret, x, y, w, h, plan_ref, entity_ids) values
    (w,'Seed Moriarty''s shadow into the earlier cases — a stray reference, an unexplained coincidence — so the Final Problem lands with weight.', false, 360, 280, 270, 140, 'The Final Problem', array[e_moriarty]);

  return w;
end $$;

revoke all on function _seed_sample_world(uuid) from public;

-- Public entry point: seed the example world for the calling user.
create or replace function seed_sample_world()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  return _seed_sample_world(uid);
end $$;

revoke all on function seed_sample_world() from public;
grant execute on function seed_sample_world() to authenticated;
