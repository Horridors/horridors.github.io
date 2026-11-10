# Horridors — Image-to-3D Print Prompts

Per-character prompts for turning the branded character portraits into printable 3D meshes using Meshy, Tripo, Rodin, or CSM.

## How to use

1. Upload the character's PNG (from `horridors-site/characters/`) to your chosen tool.
2. Paste the character-specific prompt into the tool's prompt field. Most image-to-3D tools blend the prompt with the visual reference — text nudges the geometry decisions the AI has to make for unseen sides.
3. **Recommended settings for all characters:**
   - Style: **Cartoon / Stylized / Toon** (never "Realistic")
   - Symmetry: **On** for all bipedal characters and Inky Bin; **Off** for Drip and Exlena (asymmetric)
   - Topology: **Quad** if offered, otherwise triangulated STL is fine for printing
   - Texture: **On** if you want a coloured .glb for painting reference; **Off** for pure STL/OBJ if you're painting from scratch
   - Target polycount: **50k–150k** — plenty for 60–100mm figurines
   - Output format: **STL** (or GLB with baked colour, then re-export STL)
4. Recommended print scale: **80mm tall** for the humans (Chester, Mum), **60–70mm** for the monsters, on a raft with tree supports.

---

## Universal Style Preamble

Prepend this to every prompt if the tool accepts long prompts, otherwise use character prompts on their own:

> Stylised 3D-cartoon character figurine, Pixar-adjacent proportions with oversized head and expressive features, smooth soft-plastic surface finish suitable for FDM or resin 3D printing, no floating parts, watertight closed mesh with a small flat base under the feet, standing pose facing forward, symmetrical unless noted, no accessories floating in mid-air, all straps and cables connected to the body.

---

## Chester — 7-year-old boy, autistic, red/white striped shirt

**Prompt:**
> Stylised 3D-cartoon boy, approximately 7 years old, big rounded head with warm brown tousled curly hair, large expressive brown eyes, small nose, gentle smile with a tiny gap in his front teeth. Wearing a red-and-white horizontal-striped short-sleeved t-shirt, denim shorts, mismatched ankle socks (one yellow-green, one green), and white low-top canvas sneakers. Carrying a chunky homemade cardboard-and-tape ghost-hunter backpack over both shoulders, with four coloured buttons (red, yellow, green, blue), coiled cables, and a small glowing lantern clipped to the belt — the backpack is a solid rigid prop, everything connected. Holding a small glowing red wand-shaped device in his right hand at his side (fused to his hand, no floating gap). Confident stance, weight on one foot, other hand relaxed. Head-to-body ratio roughly 1:3. Smooth toy-safe surfaces, no sharp spikes. Standing on a small flat oval base.

**Print notes:** Backpack should be modelled as a single fused unit with his back. If the mesh comes out with the wand detached from the hand, sculpt-fix in Blender before slicing.

---

## Mum — Chester's mother, warm and worried

**Prompt:**
> Stylised 3D-cartoon adult woman in her mid-30s, warm-hearted expression with slightly worried eyebrows, big soft eyes, long dark-brown hair pulled back loosely over the shoulders with front strands framing the face. Wearing a soft pink cable-knit sweater with visible ribbing on the cuffs and hem, and slim blue jeans, plain white canvas sneakers. Standing pose, one hand resting protectively at her side, the other loose. Head-to-body ratio roughly 1:5 (adult proportions), slim build. Smooth surfaces, closed mouth with a small worried half-smile. Sweater texture should be geometric (knit lines) rather than fuzzy for cleaner printing. Flat oval base.

**Print notes:** The knit sweater texture is decorative — accept it if the AI produces it cleanly, otherwise ask the tool to smooth the sweater to plain surface and paint the knit lines on manually.

---

## Thistle — cartoon cat sheriff

**Prompt:**
> Stylised 3D-cartoon anthropomorphic cat, standing upright on two legs like a cartoon character, bright golden-yellow fur all over, big round green eyes with black pupils, small pink triangular nose, cheerful smile showing two small upper fangs, rounded triangular cat ears with pink inner shells. Wearing a light-brown cowboy sheriff hat (brim curled at the sides) and a five-pointed brass sheriff star badge pinned to the chest. Long striped tail behind, curled slightly. Rounded plush proportions, head roughly 1/3 of body height, small paws, no visible clothing other than the hat and star. Confident stance, one hand on hip. Small flat round base.

**Print notes:** Sheriff hat should be a separate detachable piece if the printer struggles with the brim overhang — otherwise supports under the brim edges.

---

## Grinpatch — patchwork rag-doll monster with button eyes

**Prompt:**
> Stylised 3D-cartoon rag-doll monster figurine, humanoid shape but stitched together from patches of worn faded green and grey cloth, visible cross-stitched seams running vertically and horizontally across the body and head. Two large yellow button eyes with four thread-cross holes each. Wide crooked grin showing uneven jagged white teeth stitched onto the mouth like a mask, no separate lips. Short pudgy limbs, three-fingered stubby hands, oversized head, torso wider than legs. Wearing a scrap-cloth apron with a small pocket and a couple of tools (rusty pliers, a bent key) hanging from a belt loop. Slightly hunched, off-kilter stance, one shoulder higher than the other. Textured cloth surface look but geometry should be smooth and printable — do not model actual thread fibres. Small flat oval base.

**Print notes:** Buttons and stitch lines should be raised relief geometry (0.5–1mm) so they print cleanly, not just texture. Ask the tool to preserve raised details.

---

## Hollow — sad ghost with scarf

**Prompt:**
> Stylised 3D-cartoon ghost figurine, softly rounded elongated body like a floating pillowcase, off-white creamy colour, no visible feet — the bottom fades into a soft rounded skirt-like flare that becomes the base. Two small pointed cat-like ears on top of the head. Two large oval black eyes wide open, small black round open mouth in a worried "oh" expression. A long grey knitted scarf wrapped once around the neck, both scarf ends dangling down the front and sides with visible fringe tassels at the tips. A small teardrop-shaped translucent green gemstone pendant hanging from a thin cord around the neck, resting on the chest. Symmetrical, gentle sad expression. Solid, watertight, closed at the bottom so it prints as one piece. Scarf tassels should be short and thick, not thin whiskers.

**Print notes:** No arms, no legs — a very print-friendly character. The scarf tassels are the only weak points; keep them chunky (≥2mm at the tip).

---

## Drip — slime blob with two eye-stalks

**Prompt:**
> Stylised 3D-cartoon slime-monster figurine, teal-cyan translucent-looking body shaped like a puddle-blob with a rounded top, wider at the base than the top, small dripping stalactite bumps around the bottom rim. Two thin cylindrical eye-stalks rising from the top of the body, each ending in a round white eyeball with a small black pupil looking forward — the stalks are asymmetric, one slightly taller than the other, both slightly curved. Wide mouth low on the body showing a row of small triangular white teeth in a friendly grin. Two short stubby arms extending from the sides of the blob. No legs, no feet — the body IS the base. Chunky, gooey silhouette, no thin trailing goo strands. Watertight closed mesh. Eye-stalks should be at least 3mm thick at their thinnest point.

**Print notes:** Asymmetric — turn OFF symmetry. Eye-stalks may need light supports if printing FDM. Consider printing in translucent resin for the slime look.

---

## Inky Bin — dark cephalopod monster

**Prompt:**
> Stylised 3D-cartoon cephalopod monster figurine, dark teal-green rounded octopus-like body with a bulbous head merged into a stocky torso, mottled darker spots across the surface. Two large white eyes with round black pupils and grumpy furrowed dark eyebrows above them. Small closed frowning mouth. Four short thick tentacle-arms curling out from the sides of the body — two hanging down, two curling slightly forward. Two additional shorter tentacle-legs at the bottom that plant on the ground and act as feet, giving the figure a stable tripod-like base. Stocky, chunky proportions, wider than tall. All tentacles thick and rounded, no thin tips. Grumpy stern expression. Watertight, prints as one piece, tentacles fused to the base.

**Print notes:** Rename character in your files — this is Inky Bin, NOT "Squidley". Tentacle tips should be at least 3mm thick.

---

## Ex Preshon — one-eyed antlered demon (orange)

**Prompt:**
> Stylised 3D-cartoon one-eyed monster figurine, warm burnt-orange body, elongated humanoid shape with a rounded head fused to the torso (no visible neck). One large round central eye with a black pupil, no other eyes. A pair of tall curved dark antler-like horns sweeping up and outward from the top of the head, each with three or four short points, symmetrical and rounded at the tips (not needle-sharp). Small closed mouth. Two short thick arms with three-fingered hands, held loosely at the sides. Two short stubby legs planted on a flat base. Silhouette should read as a friendly little devil, not menacing. Antlers should be chunky and rounded — no thin fragile spikes — so they print without supports.

**Print notes:** Antlers are the risk point. Ask the tool for "chunky rounded antlers, thick base, no sharp needle tips". Consider printing antlers flat and gluing on if the tool produces thin ones.

---

## Exlena — one-eyed pink phantom

**Prompt:**
> Stylised 3D-cartoon one-eyed ghost-monster figurine, bright magenta-pink body, teardrop-shaped silhouette that widens at the bottom into a flowing skirt-like base with soft wavy edges. One large central eye with long dark eyelashes above it and a round black pupil. Small closed mouth beneath the eye. A pair of tall curved dark horns sweeping up and outward from the top of the head, softer and more feminine than Ex Preshon's — smoother curves, no separate points. Two short thin arms extending from the sides, hands held gracefully. No visible legs — the body flares into the base like a ghost. Slight forward lean, elegant pose. Watertight closed mesh, no thin trailing wisps.

**Print notes:** Asymmetric pose is optional (symmetry ON is fine). Horns should be thick at the base and taper smoothly. Print in pink resin for best colour match.

---

## Socky Shok — green fuzzy trickster

**Prompt:**
> Stylised 3D-cartoon fuzzy monster figurine, muted olive-green body shaped like a small rounded barrel with short stubby limbs. Two large hypnotic swirl-eyes on the front of the face (spiral pattern eyes) with white and black bands, no visible pupils — just spirals. Small closed neutral mouth beneath the eyes. Two small pointy ears on top of the head. Short thick arms extending outward from the sides, two short stubby legs planted on the ground. A small yellow lightning-bolt spark near one foot (fused to the base as a decorative element, not floating). Overall silhouette rounded and huggable, textured fuzzy surface but geometry smooth for printing. Watertight, single-piece mesh.

**Print notes:** Spiral eyes are the signature — model as raised relief spiral geometry (0.5mm depth) so they read clearly after painting. Lightning-bolt spark should be attached to the base.

---

## Blacky Pants — grey shark-headed brute

**Prompt:**
> Stylised 3D-cartoon monster figurine, medium-grey humanoid body with a distinctive shark-shaped head — pointed cone-like forehead sloping down to a wide angry-looking mouth showing a row of triangular shark teeth. Small angry black eyes set close together. Muscular but cartoon-proportioned humanoid body, broad shoulders narrowing at the waist, bare-chested. Wearing simple dark grey shorts. Two arms hanging at the sides with clenched fists, two short legs planted on the base. Aggressive stance, slight forward lean, feet apart. All body edges should be rounded and toy-safe — the head shape is stylised cone-shark, not a realistic shark. Teeth should be raised relief triangles, not deep gaps. Watertight, single-piece mesh, small flat oval base.

**Print notes:** The signature is the cone-shaped shark head — make sure the prompt keeps it stylised, not anatomically realistic. Teeth as shallow raised triangles rather than deep grooves, or the tool may make them fragile.

---

## Batch workflow (all 11 characters)

If you want a consistent cast that looks like a family of figurines:

1. **First pass (Meshy or Tripo, ~£15):** run all 11 characters with their prompts, symmetry ON except Drip. Download STLs and open all of them together in a slicer to check the scale is consistent — resize so Chester is 80mm and everyone scales from there (Mum ~110mm, monsters ~65–75mm).
2. **Cull weak ones:** any character that came out with visible geometry errors (Drip's stalks, Ex Preshon's antlers, Grinpatch's stitches missing) — regenerate with the multi-view sheet method (front + 3/4 + side + back) using the style anchor.
3. **Blender cleanup pass (~30 min per character):** fix pinched geometry, thicken any part <2mm, flatten the base, add a name plaque to the base if you want.
4. **Slice with these settings:**
   - Bambu A1 / P1S FDM: 0.16mm layer, tree supports, 15% infill, PLA. Chester in matte red PLA + white striped detail painted after.
   - Elegoo Saturn 4 Ultra resin: 0.05mm layer, auto-supports at 45°, 8-second exposure on ABS-like grey resin, prime with acrylic then hand-paint.

## Reference PNGs to upload

All character sources are in `horridors-site/characters/`:
- `chester.png`, `mum.png`, `thistle.png`, `grinpatch.png`, `hollow.png`
- `drip.png`, `inkybin.png`, `expreshon.png`, `exlena.png`
- `sockyshok.png`, `blacky.png`
- `cast-poster.png` — use as scale/proportion reference for the whole group

Designed by Chester Edmunds. Built by Dad using AI.
