<script setup>
	definePageMeta({ layout: 'blank' });

	const leadership = [
		{
			name: 'Alex Jackl',
			title: 'Project Director',
			photo: '/team/alex-jackl.png',
			bio: 'Alex Jackl, CEO and Chief Technology Officer of Landmark Worldwide, has volunteered for decades leading education standards bodies, councils, and consortiums nationwide. He is on the Board of Directors for the Post Secondary Standards Council (PESC), Co-Chair of the PESC Micro-Credentials Task Force, Co-Chair of the North American Technical Board of Access For Learning (A4L), Co-Chair of 1434.3 IEEE Working Group, and Chair of the Data and Technology Standards Network (DTSN) for the T3 Innovation Network (U.S. Chamber of Commerce Foundation). Alex is a technology strategist, futurist, and data scientist who specializes in developing ecosystems that support learners and educators.',
		},
		{
			name: 'Elizabeth Murphy',
			title: 'Program Director',
			photo: null,
			bio: '',
		},
		{
			name: 'Brandon Dorman',
			title: 'Lead Solution Architect',
			photo: '/team/brandon-dorman.jpg',
			bio: 'Brandon was a math teacher for 9 years before jumping into education technology in 2014 to help make technology work for everyone. He\'s been involved in 1EdTech and HROpen Skills related workgroups for a handful of years as well as building products from Early Education through Workforce to make learning visible. Past positions include Director of Skills, Senior Product Manager, Interoperability Expert, AI consultant and now Solution Architect.',
		},
	];

	const team = [
		{
			name: 'TQ White II',
			photo: '/team/tq-white.jpg',
			bio: '',
		},
		{
			name: 'Jim Goodell',
			photo: '/team/jim-goodell.jpg',
			bio: 'Jim Goodell is founder of INFERable, a Public Benefit Corporation democratizing access to learning analytics to support adaptive learning on any platform. He is editor and co-author of Learning Engineering Toolkit, Chair of the IEEE Learning Technology Standards Committee, and Secretary of the Board of Directors of the Institute for Infrastructure and Interoperable Data in Learning. He is a consultant to the U.S. Chamber of Commerce Foundation\'s T3 Innovation Network and leads Architecture and Development for the Jobs and Employment Data Exchange (JEDx). He co-led development of the Learning and Employment Record (LER) Wrapper Specification.',
		},
		{
			name: 'Greg Nadeau',
			photo: '/team/greg-nadeau.png',
			bio: 'For 30+ years, Greg has been leading innovative education and workforce data systems projects and standards at the local, state, and national levels. As CIO of the MA DOE and then as a consultant, Greg has directed successful statewide education data projects in 11 states. He led the team that created the CEDS data model, co-chaired the development of CASE and CLR standards at IMS Global, and led the workgroup that published IEEE 1484.2, the LER Ecosystem Standard. Greg is the convenor of Ed3.',
		},
		{
			name: 'John Lovell',
			photo: '/team/john-lovell.png',
			bio: 'John Lovell is a technology leader focused on education data interoperability, privacy, and standards-based innovation. He works at the intersection of K\u201312 data systems, technical architecture, and community-driven standards efforts, helping organizations turn complex data challenges into practical, scalable solutions. His work has included advancing interoperability initiatives, supporting privacy-focused data practices, and exploring how emerging technologies such as AI and semantic data models can strengthen the future of education technology.',
		},
		{
			name: 'Duane Brown',
			photo: '/team/duane-brown.jpg',
			bio: 'Duane Brown is a Senior Business Analyst at AEM Corporation with 18 years of experience in education data standards, interoperability, and state longitudinal data systems. He serves as Open Source Community Lead for the Common Education Data Standards (CEDS), facilitating collaboration among federal, state, and local education stakeholders to advance standards evolution and community engagement nationwide.',
		},
		{
			name: 'Mike Reynolds',
			photo: '/team/mike-reynolds.png',
			bio: 'Mike Reynolds serves as an Engineer and Open Standards Evangelist at Level Data, where he architected the first SIF3 Certified Broker. Since the start of the SIF 3 transition, Mike has co-led the Global Infrastructure Team and currently serves on the North American Technical Board of Access For Learning (A4L). He also lends his expertise to the SIF Unity Adoption Task Force, the CCSSO Community of Innovation\u2019s Reference Architecture Working Group, and the Student Data Privacy Consortium Technical Team.',
		},
		{
			name: 'Steve Setzer',
			photo: '/team/steve-setzer.png',
			bio: 'Steve Setzer is the CEO of Loop Data and has been implementing district and state SIF projects since 2004. He currently works with the SIF Infrastructure team as well as the North American Interoperability and Unity Adoption teams.',
		},
		{
			name: 'David Moldoff',
			photo: '/team/david-moldoff.jpg',
			bio: 'Founder and CEO of AcademyOne Inc.',
		},
		{
			name: 'Joshua Marks',
			photo: '/team/joshua-marks.jpeg',
			bio: '',
		},
	];

	const initials = (name) => name.split(' ').map(w => w[0]).join('').toUpperCase();
</script>

<template>
	<div class="team-page">
		<!-- Top Nav (same as landing) -->
		<nav class="top-nav">
			<div class="nav-inner">
				<NuxtLink to="/" class="nav-brand">
					<img src="/educore-logo.png" alt="EDUcore" class="nav-logo" />
				</NuxtLink>
				<div class="nav-links">
					<NuxtLink to="/" class="nav-link">Home</NuxtLink>
					<NuxtLink to="/explore/standards" class="nav-cta">
						Reference Library
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
					</NuxtLink>
				</div>
			</div>
		</nav>

		<!-- Header -->
		<div class="page-header">
			<h1>Who We Are</h1>
			<p>The people building the shared semantic backbone for education and workforce data interoperability.</p>
		</div>

		<!-- Leadership -->
		<section class="section-leadership">
			<div class="section-inner">
				<h2>Leadership</h2>
				<div class="leadership-grid">
					<div v-for="person in leadership" :key="person.name" class="leader-card">
						<div class="leader-photo-wrap">
							<img v-if="person.photo" :src="person.photo" :alt="person.name" class="leader-photo" />
							<div v-else class="leader-photo-placeholder">{{ initials(person.name) }}</div>
						</div>
						<div class="leader-info">
							<h3>{{ person.name }}</h3>
							<div class="leader-title">{{ person.title }}</div>
							<p v-if="person.bio">{{ person.bio }}</p>
						</div>
					</div>
				</div>
			</div>
		</section>

		<!-- Team -->
		<section class="section-team">
			<div class="section-inner">
				<h2>Team</h2>
				<div class="team-grid">
					<div v-for="person in team" :key="person.name" class="team-card">
						<img v-if="person.photo" :src="person.photo" :alt="person.name" class="team-photo" />
						<div v-else class="team-photo-placeholder">{{ initials(person.name) }}</div>
						<h4>{{ person.name }}</h4>
						<p v-if="person.bio">{{ person.bio }}</p>
					</div>
				</div>
			</div>
		</section>

		<footer>
			&copy; 2026 EDUcore Project. Building interoperability for education, together.
		</footer>
	</div>
</template>

<style scoped>
.team-page {
	--lp-primary: #072A6C;
	--lp-primary-light: #1a4a8a;
	--lp-teal: #00B5B8;
	--lp-accent: #FFAB40;
	--lp-bg: #f8f9fc;
	--lp-text: #2d3748;
	--lp-text-light: #64748b;
	--lp-border: #e2e8f0;
	font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	color: var(--lp-text);
	background: var(--lp-bg);
	line-height: 1.6;
}

/* ── Nav (shared with landing) ── */
.top-nav {
	position: sticky;
	top: 0;
	z-index: 100;
	background: rgba(255, 255, 255, 0.95);
	backdrop-filter: blur(12px);
	border-bottom: 1px solid var(--lp-border);
}

.nav-inner {
	max-width: 1200px;
	margin: 0 auto;
	padding: 0.75rem 2rem;
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.nav-brand {
	display: flex;
	align-items: center;
	text-decoration: none;
}

.nav-logo {
	height: 36px;
	width: auto;
}

.nav-links {
	display: flex;
	align-items: center;
	gap: 1.25rem;
}

.nav-link {
	padding: 0.5rem 0.75rem;
	color: var(--lp-primary);
	font-weight: 600;
	font-size: 0.9rem;
	text-decoration: none;
	border-radius: 6px;
	transition: background 0.15s;
}

.nav-link:hover {
	background: rgba(7, 42, 108, 0.06);
}

.nav-cta {
	display: inline-flex;
	align-items: center;
	gap: 0.4rem;
	padding: 0.5rem 1.25rem;
	background: var(--lp-primary);
	color: #fff;
	border-radius: 8px;
	text-decoration: none;
	font-weight: 600;
	font-size: 0.9rem;
	transition: background 0.2s, transform 0.15s;
}

.nav-cta:hover {
	background: var(--lp-primary-light);
	transform: translateY(-1px);
}

/* ── Header ── */
.page-header {
	background: linear-gradient(135deg, var(--lp-primary) 0%, var(--lp-primary-light) 60%, #1e5a9e 100%);
	color: white;
	text-align: center;
	padding: 4rem 2rem 3.5rem;
}

.page-header h1 {
	font-family: 'DM Serif Display', Georgia, serif;
	font-size: 2.5rem;
	font-weight: 400;
	color: #fff;
	margin-bottom: 0.75rem;
}

.page-header p {
	font-size: 1.1rem;
	opacity: 0.9;
	max-width: 600px;
	margin: 0 auto;
}

/* ── Sections ── */
section {
	padding: 4rem 2rem;
}

.section-inner {
	max-width: 1100px;
	margin: 0 auto;
}

section h2 {
	font-family: 'DM Serif Display', Georgia, serif;
	font-size: 1.75rem;
	font-weight: 400;
	color: var(--lp-primary);
	margin-bottom: 2rem;
}

.section-leadership {
	background: #fff;
}

/* ── Leadership Cards ── */
.leadership-grid {
	display: flex;
	flex-direction: column;
	gap: 2rem;
}

.leader-card {
	display: flex;
	gap: 2rem;
	align-items: flex-start;
	background: var(--lp-bg);
	border: 1px solid var(--lp-border);
	border-radius: 14px;
	padding: 2rem;
}

.leader-photo-wrap {
	flex-shrink: 0;
}

.leader-photo {
	width: 140px;
	height: 140px;
	border-radius: 12px;
	object-fit: cover;
	display: block;
}

.leader-photo-placeholder {
	width: 140px;
	height: 140px;
	border-radius: 12px;
	background: linear-gradient(135deg, var(--lp-primary), var(--lp-primary-light));
	color: #fff;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 2rem;
	font-weight: 700;
}

.leader-info h3 {
	font-size: 1.25rem;
	font-weight: 700;
	color: var(--lp-primary);
	margin-bottom: 0.15rem;
}

.leader-title {
	font-size: 0.88rem;
	font-weight: 600;
	color: var(--lp-teal);
	text-transform: uppercase;
	letter-spacing: 0.06em;
	margin-bottom: 0.75rem;
}

.leader-info p {
	font-size: 0.92rem;
	color: var(--lp-text-light);
	line-height: 1.7;
}

/* ── Team Grid ── */
.team-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
	gap: 1.5rem;
}

.team-card {
	background: #fff;
	border: 1px solid var(--lp-border);
	border-radius: 12px;
	padding: 1.5rem;
	transition: box-shadow 0.2s;
}

.team-card:hover {
	box-shadow: 0 8px 32px rgba(7, 42, 108, 0.1);
}

.team-photo {
	width: 80px;
	height: 80px;
	border-radius: 10px;
	object-fit: cover;
	display: block;
	margin-bottom: 1rem;
}

.team-photo-placeholder {
	width: 80px;
	height: 80px;
	border-radius: 10px;
	background: linear-gradient(135deg, var(--lp-primary), var(--lp-primary-light));
	color: #fff;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 1.25rem;
	font-weight: 700;
	margin-bottom: 1rem;
}

.team-card h4 {
	font-size: 1.05rem;
	font-weight: 700;
	color: var(--lp-primary);
	margin-bottom: 0.5rem;
}

.team-card p {
	font-size: 0.88rem;
	color: var(--lp-text-light);
	line-height: 1.65;
}

/* ── Footer ── */
footer {
	text-align: center;
	padding: 2.5rem 2rem;
	color: var(--lp-text-light);
	font-size: 0.9rem;
	border-top: 1px solid var(--lp-border);
	background: #fff;
}

/* ── Responsive ── */
@media (max-width: 700px) {
	.leader-card {
		flex-direction: column;
		align-items: center;
		text-align: center;
	}
	.team-grid {
		grid-template-columns: 1fr;
	}
	.page-header h1 {
		font-size: 2rem;
	}
}
</style>
