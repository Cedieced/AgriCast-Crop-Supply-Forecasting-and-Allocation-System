# AgriCast: Crop Supply Forecasting and Allocation System for Boac, Marinduque

**Authors:** Sheila Mae M. Romasanta, Aron M. Zulueta, John Lloyd Q. Laylay, John Cedrick R. Malco, Benedict O. Medallon, and Ken Gabriel LB. Montellano

**Program:** BS Information Technology - 3C  
**Institution:** Marinduque State University

---

# Abstract

AgriCast was proposed as a crop supply forecasting and allocation system for the Office of the Municipal Agriculturist (OMA) of Boac, Marinduque. A preliminary survey identified challenges in collecting updated crop information, consolidating barangay records, estimating harvests, and identifying possible markets for available produce. Existing methods relied on field visits, farmer interviews, spreadsheets, paper records, and digital tools.

The proposed system addresses these issues through a Field Mobile App and a Web Dashboard. The mobile application enables field personnel to record planting information, generate benchmark-based harvest estimates, and save records offline. The web dashboard allows authorized personnel to review submissions, monitor crop supply, compare projected harvests with estimated consumption, receive harvest reminders, and evaluate suggested destinations for surplus produce.

The system was developed using Flutter, HTML, CSS, JavaScript, MySQL, and Leaflet. Functional, integration, and unit testing were conducted to evaluate system performance, usability, and practical benefits.

**Keywords:** Crop Supply Forecasting, Agricultural Information Systems, Supply Allocation, Flutter, Web Dashboard, Leaflet.

---

# Introduction

## Background and Problem Context

Updated crop information is essential for agricultural offices to monitor planting activities, estimate harvests, and prepare for supply fluctuations. Existing reports from the Philippine Statistics Authority provide agricultural production data for Marinduque and the MIMAROPA region. However, a preliminary survey conducted at the Office of the Municipal Agriculturist (OMA) revealed persistent challenges in maintaining updated records, estimating harvest outputs, consolidating barangay data, and identifying potential markets for agricultural produce.

Agricultural personnel currently utilize field visits, farmer interviews, paper records, and spreadsheet-based systems. Despite these approaches, difficulties remain in organizing and validating information needed for effective planning and decision-making.

AgriCast was proposed to address these concerns through a digital platform that integrates data collection, harvest estimation, supply monitoring, and allocation support.

## Problem Statement

The study addresses the following questions:

1. How can a Field Mobile App be developed to record planting information, provide harvest estimates, and support offline synchronization?
2. How can a Web Dashboard be developed to support record review, crop monitoring, supply comparison, and allocation planning?
3. Does the developed system perform its intended functions correctly?
4. How accurate are the system’s benchmark-based harvest estimates when compared with actual harvest data?

## Objectives

### General Objective

To design, develop, and evaluate a crop supply forecasting and allocation system for the Office of the Municipal Agriculturist of Boac, Marinduque.

### Specific Objectives

1. Develop a Field Mobile App for planting record collection and offline synchronization.
2. Develop a Web Dashboard for crop monitoring and record management.
3. Test functional correctness, synchronization reliability, and calculation accuracy.
4. Evaluate the accuracy of harvest estimates using actual harvest records.

---

# Methodology

## Development Approach

The researchers adopted an incremental software development approach. Features were implemented and tested individually before being integrated into the complete system.

The development process included:

1. Requirements analysis.
2. Interface and database design.
3. Mobile application development.
4. Backend API development.
5. Dashboard development.
6. Feature integration.
7. Testing and evaluation.

## System Architecture

AgriCast consists of:

- Field Mobile Application
- Backend API
- Central MySQL Database
- Provincial Central Web Dashboard

The system supports offline recording, synchronization, approval workflows, harvest estimation, and supply allocation analysis.

## Requirements and Core Features

| Problem | Feature |
|----------|----------|
| Missing planting information | Standard planting form |
| Unclear farm location | Coordinate recording |
| Limited connectivity | Offline saving |
| Uploading saved reports | Synchronization queue |
| Harvest estimation | Benchmark-based calculations |
| Record verification | Approval workflow |
| Barangay monitoring | Maps and filters |
| Supply review | Harvest and consumption comparison |
| Coordination planning | Harvest reminders |
| Surplus management | Allocation suggestions |
| Security | User permissions |

---

# Results and Discussion

## Core Feature 1: Field Data Collection and Offline Recording

The system allows field personnel to submit planting information while offline. Records are stored locally and automatically synchronized when connectivity becomes available.

## Core Feature 2: Harvest Estimation and Geographic Monitoring

AgriCast estimates harvest dates and crop yields using configured maturity and yield benchmarks. Approved records are visualized through a barangay-level geographic monitoring map.


## Core Feature 3: Supply Review and Advisory Allocation

The system compares projected harvest volumes with estimated consumption data and recommends destinations for surplus produce.

Allocation recommendations assist agricultural personnel but do not replace administrative decision-making.

## Functional Verification

Testing confirmed that the following features passed validation:

| Feature | Status |
|----------|---------|
| Planting Record Entry | Pass |
| Offline Saving | Pass |
| Synchronization | Pass |
| Approval Process | Pass |
| Harvest Calculation | Pass |
| Barangay Summaries | Pass |
| Supply Comparison | Pass |
| Harvest Reminders | Pass |
| Allocation Suggestions | Pass |
| User Permissions | Pass |

Functional testing results are documented in the manuscript. ![EMBEDDEDIMAGE](placeholder-3)

---

# Conclusion

The study identified significant challenges in agricultural information management within the Office of the Municipal Agriculturist of Boac. AgriCast was developed to improve data collection, validation, harvest estimation, supply monitoring, and surplus allocation planning.

The developed system successfully integrates mobile data collection and web-based monitoring through offline synchronization, approval workflows, harvest forecasting, and allocation recommendations.

Although the main objectives were achieved, future improvements may include:

- Enhanced forecasting algorithms
- Weather-based prediction models
- Improved synchronization performance
- Expanded market demand analysis
- Additional user feedback and usability testing

---

# References

## IEEE Style References

[1] Philippine Statistics Authority, "Cereals statistics of Marinduque 1st semester 2025 and 2026."

[2] Philippine Statistics Authority, "PSA Marinduque PSO conducts fourth quarter 2025 crops production surveys."

[3] Philippine Statistics Authority, "2025P fruit crops statistics in Marinduque."

[4] Philippine Statistics Authority, "Major vegetables and root crops statistics in MIMAROPA Region."

[5] Philippine Statistics Authority, "2025 crops statistics in Marinduque."

[6] Provincial Government of Marinduque, *Annual Report 2025.*

[7] Briones, R.M., Galang, I.M.R., and Latigar, J.S., "Transforming Philippine agri-food systems with digital technology."

[8] FAO, *The State of Food and Agriculture 2022.*

[9] FAO and ITU, *Status of Digital Agriculture in 47 Sub-Saharan African Countries.*

[10] Lowenberg-DeBoer, J., "Economics of adoption for digital automated technologies in agriculture."

[11] FAO, "Transforming agriculture with digital automation."

[12] European Commission Joint Research Centre, "Digitalisation in Agriculture."

[13-30] Additional references retained from the manuscript.

---

# CRediT Author Contributions Statement

| Contributor | Contribution |
|--------------|--------------|
| Sheila Mae M. Romasanta | Conceptualization, Methodology, Formal Analysis, Investigation, Resources, Writing – Original Draft, Writing – Review & Editing, Supervision, Project Administration, Funding Acquisition |
| John Lloyd Q. Laylay | Conceptualization, Methodology, Investigation, Resources, Writing – Original Draft, Writing – Review & Editing, Visualization, Funding Acquisition |
| John Cedrick R. Malco | Methodology, Software Development, Validation, Investigation, Resources, Data Curation, Project Administration, Funding Acquisition |
| Aron M. Zulueta | Methodology, Software Development, Investigation, Resources, Writing – Original Draft, Writing – Review & Editing, Visualization, Funding Acquisition |
| Benedict O. Medallon | Methodology, Software Development, Investigation, Resources, Writing – Original Draft, Writing – Review & Editing, Visualization, Funding Acquisition |
| Ken Gabriel LB. Montellano | Methodology, Investigation, Resources, Writing – Review & Editing, Funding Acquisition |

---

## AI Use and Supporting Evidence

AI tools were used in preparing this manuscript. AI was used only to assist in organizing and revising some parts of the text, such as improving clarity and formatting. The researchers reviewed and revised all AI-assisted outputs before including them in the manuscript.
AI tools were also used in the development of the AgriCast system. These tools assisted in generating code suggestions, debugging errors, and explaining technical functions during development. The researchers reviewed, tested, and revised the generated outputs before using them in the syst
