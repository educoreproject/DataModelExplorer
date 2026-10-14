# CEDS Rater: sample report

*Written by `raterTool.js -buildSample`. Gold: `GOLD_EVAL_261013_jevQuestionPerBridge`. Seed: `cedsRater-humanTruthSet-101426-r2`. The same gold and seed give a byte-identical sample.json.*

## 1. The frame rules

- **Ed-Fi:** every `EdfiProperty` that references no other construct (a scalar, descriptor or enumeration property), owned by an entity: domainEntity, association, domainEntitySubclass, associationSubclass, domainEntityExtension, associationExtension, abstractEntity. Commons, inline commons and choices are reusable groups, not entities, and are left out. Each property is one element.
- **SIF (SIF260928):** every field with no child field below it. Fields with identical name + definition + type count as one element (a question asked in many objects); its path is the lexically first member's xpath, and memberCount says how many fields it stands for.
- **PESC:** the latest release in the gold of each sub-standard (PESC-CollegeTranscript-1.8.0, PESC-HighSchoolTranscript-1.6.0, PESC-TestScoreReport-1.1.0, PESC-LearningRecord-1.0.0, PESC-AcademicEportfolio-1.0.0, PESC-DocumentRequest-1.0.0, PESC-DocumentResponse-1.0.0); every element declaration whose type is not a complex type. Declarations with identical name + definition + type count as one element, across the seven releases.
- **Owner:** Ed-Fi, the owning entity; SIF, the element directly above (a parent field carries a definition; SIF objects and containers are published without one); PESC, the owning complex type.
- **No definition:** kept, with `definition: null` and `definitionAbsentReason` ("No definition published by <standard>"). Never replaced.
- **Documentation URL:** `null` for every element: the gold carries no per-element documentation link for these standards, and none is invented.

## 2. The kind rule

Each element's kind is read from its standard's own type information (`config/kindRuleRegistry.json`). The tests run in this order and the first that matches decides: identifier → indicator → code → dateTime → number → freeText.

- **identifier:** the name (a leading @ stripped) ends with `(Id|ID|Identifier|UniqueId|RefId|IdentificationCode)$` (case-sensitive), or the type is an identifier type (Ed-Fi shared type IdentificationCode; SIF RefIdType, IdRefType, gRefIdType, gRefIdPointerType, LocalIdType, or any type ending IdType / RefIdPointerType).
- **indicator:** a boolean type, or an option set whose values (up to 4) are only yes, no, y, n, true, false, unknown, na, n/a, not applicable.
- **code:** an option set (Ed-Fi descriptor or enumeration, SIF codeset, PESC code list).
- **dateTime:** Ed-Fi date, time, datetime, year; SIF date, dateTime, time, SchoolYearType, PartialDateType, gYear…; PESC an xsd date/time base type.
- **number:** Ed-Fi integer, decimal, shared integer/decimal, currency, percent, duration; SIF and PESC the xsd numeric types (SIF also MonetaryAmountType).
- **freeText:** anything else (strings, URIs, names, descriptions).

## 3. Frame sizes (revision 2 rules applied)

Revision 2 frame rules (TQ, after the A4L CEDS match work), applied to the declarations before grouping: **XML attributes** (a name beginning with @) leave every standard. **Data types:** SIF fields in the shared `SIF_Metadata` / `SIF_ExtendedElements` blocks that repeat inside every object (`sharedBlock` other than `model`) leave; PESC declarations not reachable from the message root (`reachableFromRoot` false: type definitions in the core and sector libraries the message never uses) leave; Ed-Fi has no such distinction in the gold (its reusable commons were already outside the frame), so only the attribute rule applies there. PESC elements are NOT removed for being declared in complex types: that is how PESC is published.

| standard | declarations read | removed: @ attributes | removed: data types | elements before rules | elements after rules | excluded (13 list) | frame drawn from |
|:---|---:|---:|---:|---:|---:|---:|---:|
| Ed-Fi | 899 | 0 | n/a | 899 | 899 | 5 | 894 |
| SIF | 12975 | 3789 | 5848 | 1706 | 1313 | 2 | 1311 |
| PESC | 6714 | 0 | 4328 | 1111 | 837 | 5 | 832 |

## 4. Mapped and unmapped, kind counts and the draw

An element is **mapped** when any member has an EXACT_MATCH, CLOSE_MATCH, BROAD_MATCH or NARROW_MATCH edge to a CEDS HubReference in the gold (PESC: any occurrence `<declaration>/at/…` of any member). Per standard the draw is 40 mapped + 10 unmapped. Each part is kind-stratified on its own: in proportion to that part of the frame (largest remainder), at least 4 per kind in the mapped part where the frame has them, none required in the unmapped part. `sample.json` keeps `isMappedInGold` per element and `frameMappedCountByStandard` so scores can be re-weighted to the population (weight of a mapped item = mapped frame size / 40; of an unmapped item = unmapped frame size / 10).

| standard | part | frame | identifier frame / drawn | code frame / drawn | dateTime frame / drawn | number frame / drawn | indicator frame / drawn | freeText frame / drawn |
|:---|---:|---:|---:|---:|---:|---:|---:|---:|
| Ed-Fi | mapped | 585 | 41 / 4 | 230 / 15 | 85 / 5 | 87 / 6 | 46 / 4 | 96 / 6 |
| Ed-Fi | unmapped | 309 | 22 / 1 | 94 / 3 | 51 / 2 | 33 / 1 | 32 / 1 | 77 / 2 |
| SIF | mapped | 856 | 146 / 6 | 67 / 4 | 180 / 7 | 75 / 4 | 29 / 4 | 359 / 15 |
| SIF | unmapped | 455 | 84 / 2 | 12 / 0 | 62 / 1 | 57 / 1 | 17 / 1 | 223 / 5 |
| PESC | mapped | 466 | 30 / 4 | 115 / 7 | 61 / 4 | 34 / 4 | 5 / 4 | 221 / 17 |
| PESC | unmapped | 366 | 21 / 1 | 100 / 3 | 28 / 1 | 21 / 0 | 16 / 0 | 180 / 5 |

Within a kind the draw is a seeded shuffle, first N taken.

## 5. Exclusions

| standard | excluded element | frame elements removed |
|:---|---:|---:|
| Ed-Fi | `Staff.BirthDate` | 1 |
| Ed-Fi | `ObjectiveAssessment.AcademicSubject` | 1 |
| Ed-Fi | `Course.CourseTitle` | 1 |
| Ed-Fi | `StudentSchoolAssociation.ExitWithdrawDate` | 1 |
| Ed-Fi | `StudentSchoolAssociation.ClassOfSchoolYear` | 1 |
| SIF | `/StudentPersonals/StudentPersonal/@RefId` | 0 |
| SIF | `/StudentPersonals/StudentPersonal/LocalId` | 1 |
| SIF | `/StudentPersonals/StudentPersonal/CohortYear` | 1 |
| SIF | `/StudentPersonals/StudentPersonal/ELL/@Codeset` | 0 |
| PESC | `PESC-CollegeTranscript-1.8.0 OrganizationName` | 2 |
| PESC | `PESC-CollegeTranscript-1.8.0 CourseCreditEarned` | 1 |
| PESC | `PESC-CollegeTranscript-1.8.0 AcademicAwardTitle` | 1 |
| PESC | `PESC-CollegeTranscript-1.8.0 DocumentID` | 1 |

An exclusion that removed 0 elements either was already out of the frame by a revision 2 rule (the two SIF @ attributes) or did not match the gold; the second must be investigated before rating.

## 6. Survey composition

| survey | Ed-Fi | SIF | PESC | total |
|:---|---:|---:|---:|---:|
| A | 16 | 17 | 17 | 50 |
| B | 17 | 16 | 17 | 50 |
| C | 17 | 17 | 16 | 50 |

| survey | identifier | code | dateTime | number | indicator | freeText | mapped | unmapped |
|:---|---:|---:|---:|---:|---:|---:|---:|---:|
| A | 6 | 11 | 6 | 6 | 4 | 17 | 41 | 9 |
| B | 6 | 10 | 8 | 4 | 5 | 17 | 40 | 10 |
| C | 6 | 11 | 6 | 6 | 5 | 16 | 39 | 11 |

Dealing: all 150, laid out part by part (mapped, unmapped) and kind by kind (seeded shuffle within each cell), each go to the survey with room for that standard that holds the fewest of that part-and-kind so far (then the fewest items, then survey order). The 16 rotates (A: Ed-Fi, B: SIF, C: PESC).

## 7. The 25/25 dev/sealed split (never shown by the tool)

| standard | dev | sealed | dev mapped / unmapped | sealed mapped / unmapped |
|:---|---:|---:|---:|---:|
| Ed-Fi | 25 | 25 | 20 / 5 | 20 / 5 |
| SIF | 25 | 25 | 20 / 5 | 20 / 5 |
| PESC | 25 | 25 | 20 / 5 | 20 / 5 |

Stratified by part and kind: within each part-and-kind cell the drawn elements are shuffled, cells laid end to end, halves alternating from a seeded start.

## 8. The sample

| survey | standard | mapped | kind | element | path |
|:---|---:|---:|---:|---:|---:|
| A | Ed-Fi | yes | indicator | `TeacherStudentDataLinkExclusion` | `StudentSectionAssociation.TeacherStudentDataLinkExclusion` |
| A | Ed-Fi | yes | indicator | `IDEAIndicator` | `StudentSpecialEducationProgramEligibilityAssociation.IDEAIndicator` |
| A | Ed-Fi | yes | number | `Dosage` | `StudentLanguageInstructionProgramAssociation.Dosage` |
| A | Ed-Fi | yes | code | `Section504Disability` | `StudentSection504ProgramAssociation.Section504Disability` |
| A | Ed-Fi | no | code | `EducatorRole` | `Certification.EducatorRole` |
| A | Ed-Fi | yes | number | `MaxCompletionsForCredit` | `Course.MaxCompletionsForCredit` |
| A | Ed-Fi | yes | freeText | `CourseTitle` | `CourseTranscript.CourseTitle` |
| A | Ed-Fi | yes | dateTime | `AsOfDate` | `LocalActual.AsOfDate` |
| A | Ed-Fi | yes | freeText | `Description` | `ObjectiveAssessment.Description` |
| A | Ed-Fi | no | freeText | `PathMilestoneDescription` | `PathMilestone.PathMilestoneDescription` |
| A | Ed-Fi | yes | code | `AcademicSubject` | `PerformanceEvaluation.AcademicSubject` |
| A | Ed-Fi | yes | identifier | `PersonId` | `Person.PersonId` |
| A | Ed-Fi | no | freeText | `SocialMediaUserName` | `RecruitmentEventAttendance.SocialMediaUserName` |
| A | Ed-Fi | yes | number | `NumberOfDaysAbsent` | `ReportCard.NumberOfDaysAbsent` |
| A | Ed-Fi | yes | number | `FiscalYear` | `SourceDimension.FiscalYear` |
| A | Ed-Fi | yes | code | `CharterApprovalAgencyType` | `School.CharterApprovalAgencyType` |
| A | PESC | no | dateTime | `EffectiveDate` | `Academic E Portfolio / Artifacts / Artifact Source / Contacts / Address / Effective Date` |
| A | PESC | yes | code | `CitizenshipStatusCode` | `Academic E Portfolio / Education / Application For Admission / Applicant / Person / Citizenship / Citizenship Status Code` |
| A | PESC | yes | freeText | `PositionTitle` | `Academic E Portfolio / Employment History / Employer History / Employment / Position Title` |
| A | PESC | yes | freeText | `CompetencyDescription` | `Academic E Portfolio / Competencies / Competency Description` |
| A | PESC | yes | identifier | `RecipientAssignedID` | `Academic E Portfolio / Education / College Transcript / Student / Person / Recipient Assigned ID` |
| A | PESC | yes | code | `CountryCode` | `Academic E Portfolio / Education / College Transcript / Student / Person / Residency / Country Code` |
| A | PESC | yes | code | `ResidencyStatusCode` | `Academic E Portfolio / Education / College Transcript / Student / Person / Residency / Residency Status Code` |
| A | PESC | yes | freeText | `NoteMessage` | `Academic E Portfolio / Education / College Transcript / Student / Academic Record / Academic Session / School / Note Message` |
| A | PESC | yes | dateTime | `AcademicAwardDate` | `Academic E Portfolio / Education / Application For Admission / Applicant / Self Reported Academic Record / Academic Award / Academic Award Date` |
| A | PESC | yes | number | `ClassPercentileRank` | `Academic E Portfolio / Education / Application For Admission / Applicant / Self Reported Academic Record / Class Rank / Class Percentile Rank` |
| A | PESC | yes | freeText | `ClassRankOther` | `Academic E Portfolio / Education / Application For Admission / Applicant / Self Reported Academic Record / Class Rank / Class Rank Other` |
| A | PESC | yes | freeText | `PublicAssistanceCounty` | `Academic E Portfolio / Education / Application For Admission / Applicant / Residency / Public Assistance Received / Public Assistance County` |
| A | PESC | yes | freeText | `EquivalentGradeScaleCode` | `College Transcript / Student / Academic Record / Academic Session / Course / Course Equivalent Academic Grade / Equivalent Grade Scale Code` |
| A | PESC | yes | code | `LearningOutcomeProficiencyCode` | `College Transcript / Student / Academic Record / Academic Award / Academic Summary / Academic Program / Learning Outcome / Learning Outcome Qualification Assessment / Learning Outcome Proficiency Code` |
| A | PESC | no | code | `DocumentPurpose` | `Document Request / Request Details / Document Recipient / Document Purpose` |
| A | PESC | no | freeText | `CertificationRequested` | `Document Request / Request Details / Document Recipient / Certification Requested` |
| A | PESC | yes | freeText | `EducationTestVersion` | `Test Score Report / Test Student / Education Tests / Education Test Version` |
| A | SIF | yes | freeText | `Title` | `/CurriculumStructures/CurriculumStructure/Titles/Title` |
| A | SIF | no | identifier | `LocationInfoRefId` | `/EmployeeAssignments/EmployeeAssignment/LocationInfoRefId` |
| A | SIF | yes | freeText | `PlaceOfBirth` | `/EmployeeCredentials/EmployeeCredential/Demographics/PlaceOfBirth` |
| A | SIF | yes | dateTime | `YearCreated` | `/LearningStandardItems/LearningStandardItem/StandardIdentifier/YearCreated` |
| A | SIF | yes | identifier | `EmployeePersonalRefId` | `/StaffAssignments/StaffAssignment/EmployeePersonalRefId` |
| A | SIF | yes | dateTime | `EndDate` | `/StudentAcademicRecords/StudentAcademicRecord/CourseHistory/Term/Courses/Course/EndDate` |
| A | SIF | no | number | `Numeric` | `/StudentAcademicRecords/StudentAcademicRecord/CourseHistory/Term/Courses/Course/MarkingPeriods/MarkingPeriod/MarkData/Numeric` |
| A | SIF | no | freeText | `RouteDescription` | `/StudentTransportInfos/StudentTransportInfo/OriginPoint/RouteDescription` |
| A | SIF | yes | dateTime | `endDate` | `/xCalendars/xCalendar/sessions/session/endDate` |
| A | SIF | yes | indicator | `primaryContactIndicator` | `/xContacts/xContact/relationships/relationship/primaryContactIndicator` |
| A | SIF | yes | freeText | `currentPlacement` | `/xIndividualizedEducationPlans/xIndividualizedEducationPlan/iepEligibility/background/currentPlacement` |
| A | SIF | yes | freeText | `explanation` | `/xIndividualizedEducationPlans/xIndividualizedEducationPlan/iepEligibility/eligibilityParticipantReportList/participantReport/explanation` |
| A | SIF | yes | indicator | `accepted` | `/xIndividualizedEducationPlans/xIndividualizedEducationPlan/iepPlan/annualGoalsList/annualGoal/measurableObjectiveList/measurableObjective/parentAcceptance/accepted` |
| A | SIF | yes | code | `type` | `/xIndividualizedEducationPlans/xIndividualizedEducationPlan/iepPlan/annualGoalsList/annualGoal/servicesList/service/type` |
| A | SIF | yes | identifier | `localId` | `/xRosters/xRoster/otherStaffs/otherStaff/staffPersonReference/localId` |
| A | SIF | yes | identifier | `refId` | `/xRosters/xRoster/otherStaffs/otherStaff/staffPersonReference/refId` |
| A | SIF | yes | code | `code` | `/xStudents/xStudent/languages/code` |
| B | Ed-Fi | yes | identifier | `EducationOrganizationId` | `EducationOrganization.EducationOrganizationId` |
| B | Ed-Fi | yes | indicator | `LivesWith` | `StudentContactAssociation.LivesWith` |
| B | Ed-Fi | yes | code | `InternetAccessTypeInResidence` | `StudentEducationOrganizationAssociation.InternetAccessTypeInResidence` |
| B | Ed-Fi | yes | dateTime | `TransitionNotificationDate` | `StudentSpecialEducationProgramEligibilityAssociation.TransitionNotificationDate` |
| B | Ed-Fi | no | code | `CertificationField` | `Certification.CertificationField` |
| B | Ed-Fi | yes | dateTime | `EndDate` | `Certification.EndDate` |
| B | Ed-Fi | no | code | `InstructionalSetting` | `Certification.InstructionalSetting` |
| B | Ed-Fi | yes | code | `CertificationExamStatus` | `CertificationExamResult.CertificationExamStatus` |
| B | Ed-Fi | yes | freeText | `ReporterName` | `DisciplineIncident.ReporterName` |
| B | Ed-Fi | yes | code | `EvaluationType` | `Evaluation.EvaluationType` |
| B | Ed-Fi | yes | number | `FiscalYear` | `FunctionDimension.FiscalYear` |
| B | Ed-Fi | yes | freeText | `GradeEarnedDescription` | `Grade.GradeEarnedDescription` |
| B | Ed-Fi | yes | code | `AppropriateGradeLevel` | `Intervention.AppropriateGradeLevel` |
| B | Ed-Fi | yes | identifier | `LearningStandardItemCode` | `LearningStandard.LearningStandardItemCode` |
| B | Ed-Fi | yes | dateTime | `AsOfDate` | `LocalContractedStaff.AsOfDate` |
| B | Ed-Fi | no | dateTime | `DepartureTime` | `StudentSectionAttendanceEvent.DepartureTime` |
| B | Ed-Fi | yes | code | `SchoolYear` | `Survey.SchoolYear` |
| B | PESC | yes | identifier | `OPEID` | `Academic E Portfolio / Education / Application For Admission / Applicant / Person / Employment / Employer / OPEID` |
| B | PESC | yes | freeText | `NoteMessage` | `Academic E Portfolio / Education / Application For Admission / Applicant / Self Reported Academic Record / Academic Award / Academic Honors / Note Message` |
| B | PESC | yes | dateTime | `Birthday` | `Academic E Portfolio / Education / Application For Admission / Applicant / Person / Birth / Birthday` |
| B | PESC | yes | dateTime | `BirthYear` | `Academic E Portfolio / Education / Application For Admission / Applicant / Person / Birth / Birth Year` |
| B | PESC | yes | indicator | `DeceasedIndicator` | `Academic E Portfolio / Education / Application For Admission / Applicant / Family / Family Member / Deceased / Deceased Indicator` |
| B | PESC | yes | freeText | `LocalEthnicityRaceCode` | `Academic E Portfolio / Education / Application For Admission / Applicant / Person / Ethnicity Race / Local Ethnicity Race Code` |
| B | PESC | yes | code | `TestScoreMethod` | `Academic E Portfolio / Education / College Transcript / Student / Tests / Subtest / Test Scores / Test Score Method` |
| B | PESC | yes | number | `RawScoreValue` | `Academic E Portfolio / Education / Test Score Report / Test Student / Academic Prediction / Academic Prediction Value / Raw Score Value` |
| B | PESC | yes | freeText | `TestRegistrationNumber` | `Academic E Portfolio / Education / Test Score Report / Test Student / Education Tests / Test Registration Number` |
| B | PESC | yes | identifier | `SchoolAssignedPersonID` | `Academic E Portfolio / Education / College Transcript / Student / Person / School Assigned Person ID` |
| B | PESC | yes | dateTime | `ExitDateYear` | `Academic E Portfolio / Education / Test Score Report / Test Student / Self Reported Academic Record / Exit Date Year` |
| B | PESC | yes | code | `CourseCreditBasis` | `Academic E Portfolio / Education / Application For Admission / Applicant / Self Reported Academic Record / Academic Session / Course / Course Credit Basis` |
| B | PESC | yes | freeText | `ActivitySponsorOrganizationName` | `Academic E Portfolio / Education / Application For Admission / Applicant / Extra Curricular Activity / Activity Sponsor Organization Name` |
| B | PESC | yes | freeText | `ActivityDescription` | `Academic E Portfolio / Education / Application For Admission / Applicant / Extra Curricular Activity / Activity Description` |
| B | PESC | yes | indicator | `FullTimeFlag` | `Academic E Portfolio / Education / Application For Admission / Applicant / Residency / Employment Residency / Full Time Flag` |
| B | PESC | yes | freeText | `APAS` | `College Transcript / Student / Academic Record / Academic Session / School / APAS` |
| B | PESC | yes | indicator | `CurrentEnrollmentIndicator` | `Document Request / Request Details / Requested Student / Attendance / Current Enrollment Indicator` |
| B | SIF | yes | freeText | `PostalCode` | `/ActivityProviders/ActivityProvider/Address/PostalCode` |
| B | SIF | yes | freeText | `StreetName` | `/ActivityProviders/ActivityProvider/Address/Street/StreetName` |
| B | SIF | no | freeText | `OtherStatus` | `/BusPositionInfos/BusPositionInfo/OtherStatus` |
| B | SIF | no | freeText | `Description` | `/ContentCatalogs/ContentCatalog/CurriculumHierarchyList/CurriculumHierarchy/Description` |
| B | SIF | yes | identifier | `CurriculumStructureRefId` | `/CurriculumStructures/CurriculumStructure/PredecessorObjects/CurriculumStructureRefId` |
| B | SIF | yes | number | `TotalYears` | `/EmployeeCredentials/EmployeeCredential/TotalYears` |
| B | SIF | yes | freeText | `Extension` | `/EmployeePersonals/EmployeePersonal/PhoneNumberList/PhoneNumber/Extension` |
| B | SIF | yes | freeText | `Min` | `/ItemCharacteristicss/ItemCharacteristics/Measurements/Measurement/Min` |
| B | SIF | no | dateTime | `CreationDateTime` | `/OfficialStudentPeriodAttendances/OfficialStudentPeriodAttendance/AuditInfo/CreationDateTime` |
| B | SIF | no | freeText | `ShareWithPurpose` | `/PersonPrivacyObligationDocuments/PersonPrivacyObligationDocument/ConsentToSharingOfData/DataDomainObligationList/DataDomainObligation/ShareWithList/ShareWith/ShareWithPurpose` |
| B | SIF | no | identifier | `MarkInfoRefId` | `/SectionMarkInfos/SectionMarkInfo/TermMarkLists/MarkInfoList/MarkInfoRefId` |
| B | SIF | yes | number | `CourseCreditsAttempted` | `/StudentAcademicRecords/StudentAcademicRecord/CourseHistory/Term/Courses/Course/MarkingPeriods/MarkingPeriod/CourseCreditsAttempted` |
| B | SIF | no | indicator | `Send1099` | `/VendorInfos/VendorInfo/Send1099` |
| B | SIF | yes | code | `countryCode` | `/xContacts/xContact/address/countryCode` |
| B | SIF | no | freeText | `adverseEffects` | `/xIndividualizedEducationPlans/xIndividualizedEducationPlan/iepEligibility/ideaDisability/analysis/adverseEffects` |
| B | SIF | yes | freeText | `strengthsDescription` | `/xIndividualizedEducationPlans/xIndividualizedEducationPlan/iepPlan/presentLevelPerformance/personal/strengthsDescription` |
| C | Ed-Fi | yes | code | `Weapon` | `StudentDisciplineIncidentBehaviorAssociation.Weapon` |
| C | Ed-Fi | yes | dateTime | `BeginDate` | `StudentSectionAssociation.BeginDate` |
| C | Ed-Fi | no | number | `EvaluationDelayDays` | `StudentSpecialEducationProgramEligibilityAssociation.EvaluationDelayDays` |
| C | Ed-Fi | no | dateTime | `AcceptedDate` | `Application.AcceptedDate` |
| C | Ed-Fi | no | indicator | `CurrentEmployee` | `Application.CurrentEmployee` |
| C | Ed-Fi | yes | code | `PlatformType` | `Assessment.PlatformType` |
| C | Ed-Fi | no | identifier | `ScoreRangeId` | `AssessmentScoreRangeLearningStandard.ScoreRangeId` |
| C | Ed-Fi | yes | indicator | `HispanicLatinoEthnicity` | `Candidate.HispanicLatinoEthnicity` |
| C | Ed-Fi | yes | code | `GradeLevel` | `Certification.GradeLevel` |
| C | Ed-Fi | yes | freeText | `CourseDescription` | `Course.CourseDescription` |
| C | Ed-Fi | yes | number | `FinalNumericGradeEarned` | `CourseTranscript.FinalNumericGradeEarned` |
| C | Ed-Fi | yes | freeText | `Code` | `FundDimension.Code` |
| C | Ed-Fi | yes | identifier | `AccountIdentifier` | `LocalAccount.AccountIdentifier` |
| C | Ed-Fi | yes | code | `ProgramEvaluationPeriod` | `ProgramEvaluation.ProgramEvaluationPeriod` |
| C | Ed-Fi | yes | code | `SchoolYear` | `StudentAssessment.SchoolYear` |
| C | Ed-Fi | yes | code | `AssessmentGradeLevel` | `StudentAssessmentRegistration.AssessmentGradeLevel` |
| C | Ed-Fi | yes | code | `QuestionForm` | `SurveyQuestion.QuestionForm` |
| C | PESC | no | freeText | `DUNS` | `Academic E Portfolio / Education / Application For Admission / Applicant / Person / Employment / Employer / DUNS` |
| C | PESC | yes | freeText | `AreaCityCode` | `Academic E Portfolio / Artifacts / Artifact Source / Contacts / Phone / Area City Code` |
| C | PESC | yes | freeText | `BadgeName` | `Academic E Portfolio / Education / Other Learning / Badge / Badge Name` |
| C | PESC | yes | code | `AcademicProgramDegreeLevel` | `Academic E Portfolio / Events / Event Classification / Academic Program Degree Level` |
| C | PESC | no | freeText | `RealisticLevel` | `Academic E Portfolio / Career Assessments / Career Assessment Result / Interest Profile / Realistic Level` |
| C | PESC | no | identifier | `MilitaryServiceID` | `Academic E Portfolio / Military History / Military Service ID` |
| C | PESC | no | freeText | `ProgramName` | `Academic E Portfolio / Education / Postsecondary Program / Program Name` |
| C | PESC | no | code | `DocumentType` | `Academic E Portfolio / Transmission Data / Document Type` |
| C | PESC | yes | indicator | `FinancialAidSupportIndicator` | `Academic E Portfolio / Education / Test Score Report / Test Student / School Selection Criteria / Financial Aid Needs / Financial Aid Support Indicator` |
| C | PESC | no | freeText | `NoteMessage` | `Academic E Portfolio / Education / College Transcript / Student / Person / Note Message` |
| C | PESC | yes | identifier | `AgencyAssignedID` | `Academic E Portfolio / Education / College Transcript / Student / Person / Agency Assigned ID` |
| C | PESC | yes | number | `ClassSize` | `Academic E Portfolio / Education / Application For Admission / Applicant / Self Reported Academic Record / Academic Award / Academic Summary / Class Size` |
| C | PESC | yes | number | `CourseCreditEarned` | `Academic E Portfolio / Education / Application For Admission / Applicant / Self Reported Academic Record / Academic Session / Course / Course Credit Earned` |
| C | PESC | no | code | `DocumentCompleteCode` | `Academic E Portfolio / Education / Application For Admission / Transmission Data / Document Complete Code` |
| C | PESC | yes | freeText | `NonImmigrantVisaType` | `Academic E Portfolio / Education / Application For Admission / Applicant / Person / Immigration / Visa Detail / Non Immigrant Visa Type` |
| C | PESC | yes | freeText | `TestScaleScoreValue` | `Test Score Report / Test Student / Education Tests / Test Scale Score Value` |
| C | SIF | yes | identifier | `LEAInfoRefId` | `/AssessmentAdministrations/AssessmentAdministration/LEAInfoRefId` |
| C | SIF | yes | code | `SubjectArea` | `/AssessmentSubTests/AssessmentSubTest/SubjectArea` |
| C | SIF | yes | dateTime | `StartTime` | `/BellSchedules/BellSchedule/BellPeriodList/BellPeriod/StartTime` |
| C | SIF | yes | dateTime | `BillingDate` | `/Billings/Billing/BillingDate` |
| C | SIF | yes | dateTime | `EndDate` | `/CalendarSummarys/CalendarSummary/EndDate` |
| C | SIF | yes | indicator | `RaceEthnicityDeclined` | `/EmployeeCredentials/EmployeeCredential/Demographics/RaceEthnicityDeclined` |
| C | SIF | yes | freeText | `FundClassificationCode` | `/FinancialAnnuals/FinancialAnnual/AnnualItems/AnnualItem/FundClassificationCode` |
| C | SIF | yes | freeText | `OperationalUnit` | `/FinancialAnnuals/FinancialAnnual/AnnualItems/AnnualItem/OperationalUnit` |
| C | SIF | yes | number | `FundingAllocation` | `/LEAFederalFunds/LEAFederalFund/FederalProgramList/FederalProgram/FundingAllocation` |
| C | SIF | yes | freeText | `BargainingUnit` | `/StaffEvaluations/StaffEvaluation/BargainingUnit` |
| C | SIF | yes | indicator | `UnexcusedAbsences` | `/StudentAttendanceSummarys/StudentAttendanceSummary/UnexcusedAbsences` |
| C | SIF | yes | dateTime | `EndDate` | `/UserOrganizationAssociations/UserOrganizationAssociation/EndDate` |
| C | SIF | yes | freeText | `sessionCode` | `/xCalendars/xCalendar/sessions/session/sessionCode` |
| C | SIF | yes | freeText | `suffix` | `/xContacts/xContact/name/suffix` |
| C | SIF | yes | identifier | `stateProvinceId` | `/xLeas/xLea/stateProvinceId` |
| C | SIF | yes | freeText | `timeTableDay` | `/xRosters/xRoster/meetingTimes/meetingTime/timeTableDay` |
| C | SIF | yes | number | `classRank` | `/xStudents/xStudent/academicSummary/classRank` |

