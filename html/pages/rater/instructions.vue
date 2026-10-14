<script setup>
// /rater/instructions — plain reading page (design: Instructions) holding the four worked examples of
// DRAFT-workedExamplesAndPracticeNotes-101326.md Part 1, used AS WRITTEN (TQ wants to see them in place before he
// rewrites them), attributed "Drafted with Milo for tqii; tqii will revise." Presented as "how we are judging this",
// optional reading. Left out on purpose: the DRAFT's ⚑ notes addressed to TQ (questions for him, not for raters).
import { onMounted } from 'vue';
import { useRaterStore } from '@/stores/raterStore';

definePageMeta({ layout: false });
useHead({ title: 'CEDS Rater: instructions' });

const raterStore = useRaterStore();
onMounted(() => {
	if (!raterStore.isSignedIn) {
		raterStore.restoreSession();
	}
});
</script>

<template>
	<RaterShell :show-instructions-link="false" :show-rating-link="true">
		<main class="rt-ins-main">
			<nav aria-label="On this page" class="rt-panel rt-ins-toc">
				<span class="rt-ins-toc-head">On this page</span>
				<ol>
					<li><a href="#job">The job</a></li>
					<li><a href="#answer">How to answer</a></li>
					<li><a href="#ex1">A clear match</a></li>
					<li><a href="#ex2">No match in CEDS</a></li>
					<li><a href="#ex3">More than one acceptable answer</a></li>
					<li><a href="#ex4">The same name under the wrong class</a></li>
				</ol>
				<NuxtLink to="/rater/rate" class="rt-ins-back">Back to rating</NuxtLink>
			</nav>

			<article class="rt-panel rt-ins-article" data-testid="rater-instructions">
				<h1 class="rt-serif rt-ins-title">How we are judging this</h1>
				<p class="rt-ins-lead">Optional reading, about ten minutes. Come back to it whenever a card has you stuck.</p>
				<div role="note" class="rt-ins-draft" data-testid="rater-instructions-attribution">Drafted with Milo for tqii; tqii will revise.</div>

				<h2 id="job" class="rt-ins-h2">The job</h2>
				<p>You will see 50 elements, one at a time, mixed from <b style="color: #1E7A4C">Ed-Fi</b>, <b style="color: #6B3FA0">SIF</b> and <b style="color: #072A6C">PESC</b>. Under each is a list of elements from <b style="color: #005E61">CEDS</b>. Your task: say which CEDS element means the same thing, in the same context.</p>
				<p>Meaning is what counts, not wording. The list is shuffled on purpose, so its order tells you nothing. The right answer may not be in it at all: you can search all of CEDS or browse it, and add what you find.</p>

				<h2 id="answer" class="rt-ins-h2">How to answer</h2>
				<dl class="rt-ins-dl">
					<dt>Best</dt><dd>The one card that means the same thing. Exactly one per item.</dd>
					<dt>Same</dt><dd>Optional. Once you have a Best, tick Same on any other card that is just as right, for example the same CEDS property filed under a second class.</dd>
					<dt>No match in CEDS</dt><dd>Nothing in CEDS means the same thing. A real answer, and often the right one.</dd>
					<dt>Unsure</dt><dd>You cannot decide. Write a note saying why; the note is required, and it helps us.</dd>
				</dl>

				<section aria-labelledby="ex1" class="rt-ins-example">
					<span class="rt-ins-kicker">Example 1</span>
					<h2 id="ex1" class="rt-ins-h2">A clear match</h2>
					<p><b>Ed-Fi <code>Staff.BirthDate</code></b> (date). <i>“The month, day, and year on which an individual was born.”</i></p>
					<p><b>Answer:</b> CEDS <b>Person Birth › Birthdate</b>. <i>“The year, month and day on which a person was born.”</i></p>
					<p><b>Why:</b> same meaning, same subject (a person), same kind of value (a date). The wording differs, but meaning is what counts. That this person is a staff member does not matter: CEDS records birthdate on the person, whatever their role.</p>
				</section>

				<section aria-labelledby="ex2" class="rt-ins-example">
					<span class="rt-ins-kicker">Example 2</span>
					<h2 id="ex2" class="rt-ins-h2">No match in CEDS</h2>
					<p><b>SIF <code>StudentPersonal/@RefId</code></b>. <i>“The GUID of the student.”</i></p>
					<p><b>Answer:</b> <b>no match in CEDS.</b></p>
					<p><b>Why:</b> this is the record’s key inside a SIF system, a machine-generated GUID that exists so SIF messages can point at one another. It is not an identifier a school or agency assigns to a person.</p>
					<p><b>The tempting wrong answer:</b> Person Identification › Person Identifier (Student Identifier), <i>“A unique number or alphanumeric code assigned to a person by a school, school system, a state, or other agency…”</i>. That describes an ID someone issues to the student. A GUID that exists only to link SIF records is not that.</p>
					<p><b>The rule:</b> “no match” is a real answer. Choosing the nearest card when nothing truly fits is an error, not caution.</p>
				</section>

				<section aria-labelledby="ex3" class="rt-ins-example">
					<span class="rt-ins-kicker">Example 3</span>
					<h2 id="ex3" class="rt-ins-h2">More than one acceptable answer</h2>
					<p><b>PESC College Transcript <code>CourseCreditEarned</code></b>. <i>“The number of credits a student earned by the successful completion of a course.”</i></p>
					<p><b>Answers:</b></p>
					<ul>
						<li>★ best: CEDS <b>Postsecondary Student Section › Number of Credits Earned</b> (the class: <i>“A postsecondary student’s performance in a class/section.”</i>);</li>
						<li>also acceptable: <b>Student Course Section Enrollment › Number of Credits Earned</b> (<i>“a student’s enrollment in a specific course section…”</i>).</li>
					</ul>
					<p><b>Why:</b> CEDS puts the same property, <i>“The number of credits an individual earns by the successful completion of a course”</i>, under several classes. On a college transcript, the course record is a postsecondary student’s result in a course, so the postsecondary class fits best. The generic course-enrollment class is not wrong. Choose the postsecondary card as Best, and tick the generic one Pretty much the same.</p>
					<p><b>Not acceptable:</b> K12 Student Academic Record, Staff Professional Development Activity. These are the same words in the wrong context: high school, and staff training.</p>
					<p><b>The rule:</b> when two cards would both be correct, choose one as Best and tick the other Pretty much the same. That is information, not indecision.</p>
				</section>

				<section aria-labelledby="ex4" class="rt-ins-example">
					<span class="rt-ins-kicker">Example 4</span>
					<h2 id="ex4" class="rt-ins-h2">The same name under the wrong class</h2>
					<p><b>Ed-Fi <code>ObjectiveAssessment.AcademicSubject</code></b> (descriptor). <i>“The subject area of the objective assessment.”</i> The owning entity, ObjectiveAssessment: <i>“This entity represents subtests that assess specific learning objectives.”</i></p>
					<p><b>Answer:</b> CEDS <b>Assessment Subtest › Has Assessment Academic Subject.</b></p>
					<p><b>The trap:</b> <b>Assessment › Has Assessment Academic Subject.</b> The property name and definition are identical. Only the class differs. An objective assessment is a subtest, so the subtest card is right, and the whole-assessment card is the wrong context.</p>
					<p><b>The rule:</b> read the class (CEDS) and the owning entity (the source). The same words under a different owner mean a different thing. Use the class browser when cards look alike.</p>
				</section>

				<NuxtLink to="/rater/rate" class="rt-ins-back">Back to rating</NuxtLink>
			</article>
		</main>
	</RaterShell>
</template>

<style scoped>
.rt-ins-main { max-width: 1100px; margin: 0 auto; padding: 28px clamp(16px, 3vw, 40px) 64px; box-sizing: border-box; display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start; }
.rt-ins-toc { flex: 1 1 220px; padding: 16px; display: flex; flex-direction: column; gap: 8px; font-size: 14px; position: sticky; top: 12px; }
.rt-ins-toc-head { font-weight: 700; color: #4B5563; text-transform: uppercase; font-size: 12px; letter-spacing: 0.05em; }
.rt-ins-toc ol { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; }
.rt-ins-back { font-weight: 700; margin-top: 8px; display: inline-block; }
.rt-ins-article { flex: 999 1 560px; min-width: 0; padding: 28px 32px; font-size: 16px; line-height: 1.6; color: #1F2937; }
.rt-ins-title { margin: 0; font-size: 36px; color: #072A6C; }
.rt-ins-lead { margin: 6px 0 12px; color: #4B5563; }
.rt-ins-draft { background: #FFF6E8; border: 1px solid #F5C77E; border-radius: 8px; padding: 8px 12px; font-size: 14px; font-weight: 600; color: #8A5200; }
.rt-ins-h2 { font-size: 22px; font-weight: 700; margin: 24px 0 8px; color: #111827; }
.rt-ins-dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 6px 16px; }
.rt-ins-dl dt { font-weight: 700; color: #072A6C; }
.rt-ins-dl dd { margin: 0; }
.rt-ins-example { border-top: 1px solid #E3E7EF; margin-top: 24px; }
.rt-ins-kicker { display: block; margin-top: 16px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #00797C; }
.rt-ins-example .rt-ins-h2 { margin-top: 2px; }
.rt-ins-article code { font-family: ui-monospace, Menlo, monospace; font-size: 14px; background: #F3F5FA; padding: 0 4px; border-radius: 4px; }
</style>
