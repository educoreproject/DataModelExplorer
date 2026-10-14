# CEDS Rater: sample report

*Written by `raterTool.js -buildSample`. Gold: `GOLD_EVAL_261013_jevQuestionPerBridge`. Seed: `cedsRater-humanTruthSet-101426`. The same gold and seed give a byte-identical sample.json.*

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

## 3. Frame sizes

| standard | declarations read | elements (after grouping) | excluded | frame drawn from |
|:---|---:|---:|---:|---:|
| Ed-Fi | 899 | 899 | 5 | 894 |
| SIF | 12975 | 1706 | 4 | 1702 |
| PESC | 6714 | 1111 | 5 | 1106 |

## 4. Kind counts in each frame (after exclusions) and the draw

| standard | identifier frame / drawn | code frame / drawn | dateTime frame / drawn | number frame / drawn | indicator frame / drawn | freeText frame / drawn |
|:---|---:|---:|---:|---:|---:|---:|
| Ed-Fi | 63 / 4 | 324 / 18 | 136 / 7 | 120 / 7 | 78 / 4 | 173 / 10 |
| SIF | 445 / 12 | 100 / 4 | 262 / 6 | 134 / 4 | 52 / 4 | 709 / 20 |
| PESC | 58 / 4 | 248 / 10 | 115 / 4 | 118 / 5 | 44 / 4 | 523 / 23 |

Allocation: 50 per standard in proportion to the frame (largest remainder), at least 4 per kind where the frame has them (all of them where it has fewer). Within a kind the draw is a seeded shuffle, first N taken.

## 5. Exclusions

| standard | excluded element | frame elements removed |
|:---|---:|---:|
| Ed-Fi | `Staff.BirthDate` | 1 |
| Ed-Fi | `ObjectiveAssessment.AcademicSubject` | 1 |
| Ed-Fi | `Course.CourseTitle` | 1 |
| Ed-Fi | `StudentSchoolAssociation.ExitWithdrawDate` | 1 |
| Ed-Fi | `StudentSchoolAssociation.ClassOfSchoolYear` | 1 |
| SIF | `/StudentPersonals/StudentPersonal/@RefId` | 1 |
| SIF | `/StudentPersonals/StudentPersonal/LocalId` | 1 |
| SIF | `/StudentPersonals/StudentPersonal/CohortYear` | 1 |
| SIF | `/StudentPersonals/StudentPersonal/ELL/@Codeset` | 1 |
| PESC | `PESC-CollegeTranscript-1.8.0 OrganizationName` | 2 |
| PESC | `PESC-CollegeTranscript-1.8.0 CourseCreditEarned` | 1 |
| PESC | `PESC-CollegeTranscript-1.8.0 AcademicAwardTitle` | 1 |
| PESC | `PESC-CollegeTranscript-1.8.0 DocumentID` | 1 |

An exclusion that removed 0 elements did not match the gold and must be investigated before rating.

## 6. Survey composition

| survey | Ed-Fi | SIF | PESC | total |
|:---|---:|---:|---:|---:|
| A | 16 | 17 | 17 | 50 |
| B | 17 | 16 | 17 | 50 |
| C | 17 | 17 | 16 | 50 |

| survey | identifier | code | dateTime | number | indicator | freeText |
|:---|---:|---:|---:|---:|---:|---:|
| A | 7 | 11 | 5 | 5 | 4 | 18 |
| B | 7 | 10 | 6 | 6 | 4 | 17 |
| C | 6 | 11 | 6 | 5 | 4 | 18 |

Dealing: all 150, laid out kind by kind (seeded shuffle within kind), each go to the survey with room for that standard that holds the fewest of that kind so far (then the fewest items, then survey order). The 16 rotates (A: Ed-Fi, B: SIF, C: PESC).

## 7. The 25/25 dev/sealed split (never shown by the tool)

| standard | dev | sealed |
|:---|---:|---:|
| Ed-Fi | 25 | 25 |
| SIF | 25 | 25 |
| PESC | 25 | 25 |

Kind-stratified: within each kind the drawn elements are shuffled, kinds laid end to end, halves alternating from a seeded start.

## 8. The sample

| survey | standard | kind | element | path |
|:---|---:|---:|---:|---:|
| A | Ed-Fi | code | `EducationOrganizationCategory` | `EducationOrganization.EducationOrganizationCategory` |
| A | Ed-Fi | dateTime | `BeginDate` | `CandidateEducatorPreparationProgramAssociation.BeginDate` |
| A | Ed-Fi | dateTime | `EndDate` | `EducationOrganizationNetworkAssociation.EndDate` |
| A | Ed-Fi | code | `InternetPerformanceInResidence` | `StudentEducationOrganizationAssociation.InternetPerformanceInResidence` |
| A | Ed-Fi | dateTime | `ConsentToEvaluationReceivedDate` | `StudentSpecialEducationProgramEligibilityAssociation.ConsentToEvaluationReceivedDate` |
| A | Ed-Fi | code | `HighNeedsAcademicSubject` | `Application.HighNeedsAcademicSubject` |
| A | Ed-Fi | code | `Sex` | `Candidate.Sex` |
| A | Ed-Fi | code | `CertificationField` | `Certification.CertificationField` |
| A | Ed-Fi | number | `MinRating` | `Evaluation.MinRating` |
| A | Ed-Fi | identifier | `FieldworkIdentifier` | `FieldworkExperience.FieldworkIdentifier` |
| A | Ed-Fi | number | `MaxPoints` | `GradebookEntry.MaxPoints` |
| A | Ed-Fi | code | `SectionType` | `Section.SectionType` |
| A | Ed-Fi | code | `HighestCompletedLevelOfEducation` | `Staff.HighestCompletedLevelOfEducation` |
| A | Ed-Fi | code | `AssignmentLateStatus` | `StudentGradebookEntry.AssignmentLateStatus` |
| A | Ed-Fi | code | `FundingSource` | `OpenStaffPosition.FundingSource` |
| A | Ed-Fi | identifier | `SchoolId` | `School.SchoolId` |
| A | PESC | freeText | `TotalNetDisbursementAmount` | `Academic ePortfolio 1.0.0 / AttendedSchoolDisbursementResponseType / TotalNetDisbursementAmount` |
| A | PESC | number | `UndergradHoursInGradDegree` | `Academic ePortfolio 1.0.0 / GraduateLevelCreditAllocationType / UndergradHoursInGradDegree` |
| A | PESC | indicator | `CreditAuthorizationIndicator` | `Academic ePortfolio 1.0.0 / PersonFinancialDataType / CreditAuthorizationIndicator` |
| A | PESC | freeText | `ReligiousAffiliation` | `Academic ePortfolio 1.0.0 / PersonType / ReligiousAffiliation` |
| A | PESC | freeText | `NoteMessage` | `Academic E Portfolio / Education / College Transcript / Student / Tests / Subtest / Note Message` |
| A | PESC | freeText | `RealisticLevel` | `Academic E Portfolio / Career Assessments / Career Assessment Result / Interest Profile / Realistic Level` |
| A | PESC | identifier | `CountryIdentifier` | `Academic E Portfolio / Education / Other Learning / Badge / Badge Issuing Organization / Country Identifier` |
| A | PESC | indicator | `PrerequisiteCourseIndicator` | `Academic ePortfolio 1.0.0 / CoursePrerequisiteType / PrerequisiteCourseIndicator` |
| A | PESC | indicator | `RushProcessingRequested` | `Academic ePortfolio 1.0.0 / RecipientType / RushProcessingRequested` |
| A | PESC | code | `TranscriptType` | `Academic ePortfolio 1.0.0 / RecipientType / TranscriptType` |
| A | PESC | code | `SchoolServices` | `Academic E Portfolio / Education / Test Score Report / Test Student / School Selection Criteria / School Support Services / School Services` |
| A | PESC | number | `ClassPercentileRank` | `Academic E Portfolio / Education / Application For Admission / Applicant / Self Reported Academic Record / Class Rank / Class Percentile Rank` |
| A | PESC | freeText | `ClassRankOther` | `Academic E Portfolio / Education / Application For Admission / Applicant / Self Reported Academic Record / Class Rank / Class Rank Other` |
| A | PESC | freeText | `CourseNumber` | `Academic E Portfolio / Education / Application For Admission / Applicant / Self Reported Academic Record / Academic Session / Course / Course Number` |
| A | PESC | freeText | `PassportNumber` | `Academic E Portfolio / Education / Application For Admission / Applicant / Person / Immigration / Passport Detail / Passport Number` |
| A | PESC | freeText | `AccreditingBodyName` | `College Transcript / Transmission Data / Destination / Organization / Accreditation / Accrediting Body Name` |
| A | PESC | freeText | `EducationTestGroup` | `College Transcript 1.8.0 / EducationTestsType / EducationTestGroup` |
| A | SIF | dateTime | `AdministrationDate` | `/Assignments/Assignment/AssignmentTime/AdministrationDate` |
| A | SIF | identifier | `@RefId` | `/Billings/Billing/@RefId` |
| A | SIF | freeText | `GraduationDate` | `/CalendarSummarys/CalendarSummary/GraduationDate` |
| A | SIF | identifier | `FinancialAccountRefId` | `/FinancialAccountAccountingPeriodLocationInfos/FinancialAccountAccountingPeriodLocationInfo/FinancialAccountRefId` |
| A | SIF | number | `Value` | `/FoodserviceItemSaless/FoodserviceItemSales/ItemQuantities/ItemQuantity/Value` |
| A | SIF | freeText | `Description` | `/FoodserviceItems/FoodserviceItem/Description` |
| A | SIF | freeText | `@AccountTypeCodeset` | `/FoodserviceSaless/FoodserviceSales/SalesAmounts/SalesAmount/@AccountTypeCodeset` |
| A | SIF | freeText | `Biserial` | `/ItemCharacteristicss/ItemCharacteristics/Descriptive/Biserial` |
| A | SIF | freeText | `Title` | `/LearningStandardDocuments/LearningStandardDocument/Title` |
| A | SIF | freeText | `@SIF_RefObject` | `/LibraryPatronStatuss/LibraryPatronStatus/@SIF_RefObject` |
| A | SIF | freeText | `@Type` | `/LibraryPatronStatuss/LibraryPatronStatus/TransactionList/Transaction/HoldInfoList/HoldInfo/@Type` |
| A | SIF | freeText | `Department` | `/StudentAcademicRecords/StudentAcademicRecord/CourseHistory/Term/Courses/Course/SchoolCourseInfoData/Department` |
| A | SIF | identifier | `SchoolAttendedRefId` | `/StudentAcademicRecords/StudentAcademicRecord/CurrentCourseActivity/Courses/Course/SchoolAttendedRefId` |
| A | SIF | freeText | `ServiceProviderName` | `/StudentPlacements/StudentPlacement/ServiceProviderName` |
| A | SIF | indicator | `SpecialNeedsTransportation` | `/StudentPlacements/StudentPlacement/SpecialNeedsTransportation` |
| A | SIF | dateTime | `@SnapDate` | `/StudentSnapshots/StudentSnapshot/@SnapDate` |
| A | SIF | identifier | `SchoolInfoRefId` | `/TestAccommodations/TestAccommodation/SchoolInfoRefId` |
| B | Ed-Fi | code | `EPPProgramPathway` | `CandidateEducatorPreparationProgramAssociation.EPPProgramPathway` |
| B | Ed-Fi | dateTime | `EndDate` | `GeneralStudentProgramAssociation.EndDate` |
| B | Ed-Fi | number | `HourlyWage` | `StaffEducationOrganizationEmploymentAssociation.HourlyWage` |
| B | Ed-Fi | indicator | `TeacherStudentDataLinkExclusion` | `StaffSectionAssociation.TeacherStudentDataLinkExclusion` |
| B | Ed-Fi | indicator | `Tenured` | `StaffEducationOrganizationEmploymentAssociation.Tenured` |
| B | Ed-Fi | indicator | `PrivateCTEProgram` | `StudentCTEProgramAssociation.PrivateCTEProgram` |
| B | Ed-Fi | freeText | `CodeName` | `BalanceSheetDimension.CodeName` |
| B | Ed-Fi | identifier | `CertificationExamIdentifier` | `CertificationExam.CertificationExamIdentifier` |
| B | Ed-Fi | dateTime | `EndDate` | `CertificationExam.EndDate` |
| B | Ed-Fi | freeText | `Objective` | `CompetencyObjective.Objective` |
| B | Ed-Fi | freeText | `CredentialEndorsement` | `Credential.CredentialEndorsement` |
| B | Ed-Fi | number | `Cost` | `EducationContent.Cost` |
| B | Ed-Fi | code | `RubricRatingLevel` | `RubricDimension.RubricRatingLevel` |
| B | Ed-Fi | number | `FiscalYear` | `SourceDimension.FiscalYear` |
| B | Ed-Fi | freeText | `GenderIdentity` | `Staff.GenderIdentity` |
| B | Ed-Fi | code | `TransportationPublicExpenseEligibilityType` | `StudentTransportation.TransportationPublicExpenseEligibilityType` |
| B | Ed-Fi | number | `TotalBudgeted` | `OpenStaffPosition.TotalBudgeted` |
| B | PESC | freeText | `RigorousHighSchoolProgram` | `Academic ePortfolio 1.0.0 / AcademicCompetitivenessGrantType / RigorousHighSchoolProgram` |
| B | PESC | dateTime | `Birthday` | `Academic E Portfolio / Education / Application For Admission / Applicant / Person / Birth / Birthday` |
| B | PESC | freeText | `CampusName` | `Academic E Portfolio / Education / Application For Admission / Applicant / Residency / Employment At Applied School / Campus Name` |
| B | PESC | dateTime | `EmploymentBeginDate` | `Academic E Portfolio / Employment History / Employer History / Employment / Employment Begin Date` |
| B | PESC | code | `USStudyFormsReceipt` | `Academic ePortfolio 1.0.0 / ImmigrationType / USStudyFormsReceipt` |
| B | PESC | identifier | `OtherLearningID` | `Academic E Portfolio / Education / Other Learning / Other Learning Experience / Other Learning ID` |
| B | PESC | freeText | `AcademicPredictionSubject` | `Academic E Portfolio / Education / Test Score Report / Test Student / Academic Prediction / Academic Prediction Subject` |
| B | PESC | code | `CourseInstructionSite` | `Academic E Portfolio / Education / College Transcript / Student / Academic Record / Academic Session / Course / Course Instruction Site` |
| B | PESC | freeText | `ServiceProvider` | `Academic ePortfolio 1.0.0 / ElectronicDeliveryType / ServiceProvider` |
| B | PESC | number | `StandardScoreValue` | `Academic E Portfolio / Education / Test Score Report / Test Student / Academic Prediction / Academic Prediction Value / Norm Referenced Values / Standard Score Value` |
| B | PESC | indicator | `GraduationIndicator` | `Academic E Portfolio / Education / Test Score Report / Test Student / Self Reported Academic Record / Graduation Indicator` |
| B | PESC | freeText | `MilitaryDutyLocation` | `Academic E Portfolio / Education / Application For Admission / Applicant / Residency / Active Duty Military / Military Duty Location` |
| B | PESC | code | `QuestionAreaCode` | `Academic E Portfolio / Education / Application For Admission / Applicant / Application / Application Detail / Application Degree Program / Application Question / Question Area Code` |
| B | PESC | freeText | `SSN` | `Academic E Portfolio / Education / Application For Admission / Applicant / Person / SSN` |
| B | PESC | code | `DocumentCompleteCode` | `Academic E Portfolio / Education / Application For Admission / Transmission Data / Document Complete Code` |
| B | PESC | freeText | `City` | `College Transcript / Student / Academic Record / Academic Session / School / Contacts / Address / City` |
| B | PESC | code | `DocumentPurpose` | `Document Request / Request Details / Document Recipient / Document Purpose` |
| B | SIF | freeText | `Line3` | `/ActivityProviders/ActivityProvider/Address/Street/Line3` |
| B | SIF | identifier | `@RefId` | `/AssessmentPackages/AssessmentPackage/@RefId` |
| B | SIF | identifier | `@RefId` | `/EmployeeCredits/EmployeeCredit/@RefId` |
| B | SIF | freeText | `@Type` | `/EmployeePictures/EmployeePicture/PictureSource/@Type` |
| B | SIF | identifier | `@RefId` | `/FinancialAccounts/FinancialAccount/@RefId` |
| B | SIF | freeText | `Description` | `/FinancialAccounts/FinancialAccount/Description` |
| B | SIF | identifier | `@RefId` | `/FinancialIncomeStatements/FinancialIncomeStatement/@RefId` |
| B | SIF | freeText | `@Type` | `/FoodserviceStaffEnrollmentCounts/FoodserviceStaffEnrollmentCount/Counts/Count/EarnedStatus/@Type` |
| B | SIF | code | `ScoreEmptyReason` | `/GradingAssignmentScores/GradingAssignmentScore/ScoreEmptyReason` |
| B | SIF | dateTime | `DueDate` | `/GradingAssignments/GradingAssignment/DueDate` |
| B | SIF | identifier | `@TermInfoRefId` | `/GradingCategorys/GradingCategory/@TermInfoRefId` |
| B | SIF | dateTime | `LocalAdoptionDate` | `/LearningStandardDocuments/LearningStandardDocument/LocalAdoptionDate` |
| B | SIF | code | `NeverShareWithRole` | `/PersonPrivacyObligationDocuments/PersonPrivacyObligationDocument/ConsentToSharingOfData/NeverShareWithList/NeverShareWith/NeverShareWithRole` |
| B | SIF | number | `SchoolImprovementAllocation` | `/SchoolFederalFunds/SchoolFederalFund/SchoolImprovementAllocation` |
| B | SIF | freeText | `consequences` | `/xIndividualizedEducationPlans/xIndividualizedEducationPlan/iepPlan/presentLevelPerformance/academic/deficitList/deficit/consequences` |
| B | SIF | freeText | `diagnosticStatement` | `/xIndividualizedEducationPlans/xIndividualizedEducationPlan/iepPlan/presentLevelPerformance/personal/evaluation/performance/testResultList/diagnosticStatement` |
| C | Ed-Fi | freeText | `MajorSpecialization` | `CandidateEducatorPreparationProgramAssociation.MajorSpecialization` |
| C | Ed-Fi | dateTime | `EndDate` | `StaffProgramAssociation.EndDate` |
| C | Ed-Fi | code | `Sex` | `ApplicantProfile.Sex` |
| C | Ed-Fi | code | `ApplicationEventResult` | `ApplicationEvent.ApplicationEventResult` |
| C | Ed-Fi | identifier | `CourseCode` | `Course.CourseCode` |
| C | Ed-Fi | code | `CreditCategory` | `CourseTranscript.CreditCategory` |
| C | Ed-Fi | freeText | `CaseNumber` | `DisciplineIncident.CaseNumber` |
| C | Ed-Fi | freeText | `EvaluationTitle` | `Evaluation.EvaluationTitle` |
| C | Ed-Fi | code | `EvaluationType` | `EvaluationElement.EvaluationType` |
| C | Ed-Fi | number | `PercentOfAssessment` | `ObjectiveAssessment.PercentOfAssessment` |
| C | Ed-Fi | freeText | `ProgramEvaluationElementTitle` | `ProgramEvaluationElement.ProgramEvaluationElementTitle` |
| C | Ed-Fi | freeText | `SocialMediaUserName` | `RecruitmentEventAttendance.SocialMediaUserName` |
| C | Ed-Fi | code | `EducationalEnvironment` | `RestraintEvent.EducationalEnvironment` |
| C | Ed-Fi | dateTime | `BeginDate` | `Session.BeginDate` |
| C | Ed-Fi | indicator | `HispanicLatinoEthnicity` | `Staff.HispanicLatinoEthnicity` |
| C | Ed-Fi | code | `NonMedicalImmunizationExemption` | `StudentHealth.NonMedicalImmunizationExemption` |
| C | Ed-Fi | freeText | `SurveySectionTitle` | `SurveySection.SurveySectionTitle` |
| C | PESC | freeText | `ThesisDissertationAdvisor` | `Academic E Portfolio / Education / Application For Admission / Applicant / Self Reported Academic Record / Academic Award / Academic Degree Requirement / Thesis Dissertation Advisor` |
| C | PESC | freeText | `SessionDesignatorSuffix` | `Academic E Portfolio / Education / Application For Admission / Applicant / Application / Application Detail / Application Session / Session Designator Suffix` |
| C | PESC | freeText | `NoteMessage` | `Academic E Portfolio / Education / College Transcript / Student / Person / Agency Identifier / Note Message` |
| C | PESC | number | `GPARangeMaximum` | `Academic E Portfolio / Education / Application For Admission / Applicant / Self Reported Academic Record / Academic Award / Academic Summary / GPA / GPA Range Maximum` |
| C | PESC | dateTime | `RequiredFormsReceiveDate` | `Academic ePortfolio 1.0.0 / ImmigrationType / RequiredFormsReceiveDate` |
| C | PESC | freeText | `FirstName` | `Academic E Portfolio / Education / Application For Admission / Applicant / Person / Alternate Name / First Name` |
| C | PESC | number | `WeeksProgramsAcademicYear` | `Academic ePortfolio 1.0.0 / PellType / WeeksProgramsAcademicYear` |
| C | PESC | identifier | `ReferenceID` | `Academic E Portfolio / Networks / Personal Reference / Reference ID` |
| C | PESC | code | `RelationshipCode` | `Academic E Portfolio / Networks / Personal Reference / Relationship Code` |
| C | PESC | freeText | `SelfReportedIndicator` | `Academic E Portfolio / Artifacts / Artifact Source / Self Reported Indicator` |
| C | PESC | freeText | `EducationTestName` | `Academic E Portfolio / Education / Test Score Report / Test Student / Education Tests / Education Test Name` |
| C | PESC | dateTime | `YearMonthEnd` | `Academic E Portfolio / Education / Test Score Report / Test Student / Student Activities / Extracurricular Activitity / Year Month End` |
| C | PESC | identifier | `AgencyAssignedID` | `Academic E Portfolio / Education / HS Transcript / Student / Person / Agency Assigned ID` |
| C | PESC | freeText | `RefereePositionInOrganization` | `Academic E Portfolio / Education / Application For Admission / Applicant / Application / Recommendation Reference / Referee Position In Organization` |
| C | PESC | code | `SchoolAppliedEmployedCode` | `Academic E Portfolio / Education / Application For Admission / Applicant / Person / Employment / School Applied Employed Code` |
| C | PESC | code | `DeliveryMethod` | `Document Request / Request Details / Document Recipient / Delivery Method` |
| C | SIF | indicator | `Cost` | `/AccountingPeriods/AccountingPeriod/SIF_Metadata/RightsElements/RightsElement/Cost` |
| C | SIF | code | `@Type` | `/ActivityProviders/ActivityProvider/Address/@Type` |
| C | SIF | freeText | `ApartmentNumber` | `/ActivityProviders/ActivityProvider/Address/Street/ApartmentNumber` |
| C | SIF | freeText | `@EvaluationType` | `/Activitys/Activity/Evaluation/@EvaluationType` |
| C | SIF | number | `MaximumLoad` | `/BusRouteInfos/BusRouteInfo/MaximumLoad` |
| C | SIF | dateTime | `JobEndDate` | `/EmployeeAssignments/EmployeeAssignment/JobEndDate` |
| C | SIF | freeText | `MaritalStatus` | `/EmployeeCredentials/EmployeeCredential/Demographics/MaritalStatus` |
| C | SIF | indicator | `Active` | `/EmploymentRecords/EmploymentRecord/Active` |
| C | SIF | freeText | `@Type` | `/FoodserviceMealPricess/FoodserviceMealPrices/Prices/Price/MealStatus/@Type` |
| C | SIF | freeText | `RefURI` | `/LearningStandardAssociations/LearningStandardAssociation/RefURI` |
| C | SIF | identifier | `StateProvinceId` | `/LocationInfos/LocationInfo/StateProvinceId` |
| C | SIF | dateTime | `ActiveSchoolYear` | `/SchoolInfos/SchoolInfo/ActiveSchoolYear` |
| C | SIF | identifier | `SectionInfoRefId` | `/StaffSectionAssignments/StaffSectionAssignment/SectionInfoRefId` |
| C | SIF | identifier | `@RefId` | `/TestAccommodations/TestAccommodation/@RefId` |
| C | SIF | code | `scedCourseSubjectAreaCode` | `/xCourses/xCourse/scedCourseSubjectAreaCode` |
| C | SIF | indicator | `eligible` | `/xIndividualizedEducationPlans/xIndividualizedEducationPlan/iepEligibility/ideaDisability/decisions/eligible` |
| C | SIF | number | `category` | `/xIndividualizedEducationPlans/xIndividualizedEducationPlan/iepPlan/annualGoalsList/annualGoal/progressReportList/progressReport/measurement/dataValuesList/dataValue/category` |

