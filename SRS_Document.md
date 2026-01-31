# Software Requirements Specification (SRS)

## GPS-Based Lorry Management System

**Version:** 1.0  
**Date:** January 31, 2026  
**Prepared by:** Development Team  
**Organization:** RKS Transports  

---

## Document Revision History

| Version | Date | Author | Description |
|---------|------|--------|-------------|
| 1.0 | January 31, 2026 | Development Team | Initial SRS Document |

---

## Table of Contents

1. [Introduction](#1-introduction)
   - 1.1 Purpose
   - 1.2 Scope
   - 1.3 Definitions, Acronyms, and Abbreviations
   - 1.4 References
   - 1.5 Overview
2. [Overall Description](#2-overall-description)
   - 2.1 Product Perspective
   - 2.2 Product Functions
   - 2.3 User Classes and Characteristics
   - 2.4 Operating Environment
   - 2.5 Design and Implementation Constraints
   - 2.6 Assumptions and Dependencies
3. [System Features](#3-system-features)
4. [External Interface Requirements](#4-external-interface-requirements)
5. [Non-Functional Requirements](#5-non-functional-requirements)
6. [Database Requirements](#6-database-requirements)
7. [Appendices](#7-appendices)

---

## 1. Introduction

### 1.1 Purpose

This Software Requirements Specification (SRS) document provides a complete description of the GPS-Based Lorry Management System. It describes the functional and non-functional requirements for the system, which will be used by RKS Transports to manage their fleet of lorries, drivers, trips, and associated operations.

The intended audience for this document includes:
- Project stakeholders and management
- Development team
- Quality assurance team
- System administrators
- End users (Admin, Managers, Drivers)

### 1.2 Scope

The GPS-Based Lorry Management System is a comprehensive web-based application designed to streamline and automate the management of lorry operations. The system will:

**Primary Goals:**
- Manage fleet of lorries and their maintenance schedules
- Track and manage driver information and assignments
- Plan, execute, and monitor trips
- Track real-time GPS locations of lorries
- Manage fuel consumption and costs
- Generate and track invoices
- Provide role-based dashboards for different user types

**Benefits:**
- Improved operational efficiency
- Real-time tracking and monitoring
- Reduced administrative overhead
- Better resource utilization
- Enhanced decision-making through data analytics
- Improved customer service through accurate ETA predictions

**Out of Scope:**
- Mobile application (Phase 2)
- Customer portal (Phase 2)
- Integration with third-party logistics platforms (Phase 2)
- Automated route optimization (Phase 2)

### 1.3 Definitions, Acronyms, and Abbreviations

| Term | Definition |
|------|------------|
| **GPS** | Global Positioning System |
| **LR** | Lorry Receipt - A document acknowledging receipt of goods for transport |
| **ETA** | Estimated Time of Arrival |
| **CRUD** | Create, Read, Update, Delete |
| **API** | Application Programming Interface |
| **JWT** | JSON Web Token |
| **SSL** | Secure Sockets Layer |
| **SRS** | Software Requirements Specification |
| **UI** | User Interface |
| **Admin** | System Administrator |
| **NeonDB** | Cloud-hosted PostgreSQL database service |

### 1.4 References

- IEEE Std 830-1998, IEEE Recommended Practice for Software Requirements Specifications
- PostgreSQL 15 Documentation
- Node.js Documentation
- React Documentation
- NeonDB Documentation

### 1.5 Overview

This SRS document is organized into seven main sections:
- Section 1 provides an introduction to the document
- Section 2 provides an overall description of the system
- Section 3 details the specific system features and requirements
- Section 4 describes external interface requirements
- Section 5 outlines non-functional requirements
- Section 6 specifies database requirements
- Section 7 contains appendices with additional information

---

## 2. Overall Description

### 2.1 Product Perspective

The GPS-Based Lorry Management System is a new, self-contained product designed specifically for RKS Transports. It replaces manual and spreadsheet-based processes currently in use.

**System Context:**

```
┌─────────────────────────────────────────────────────────┐
│                    External Systems                      │
├─────────────────────────────────────────────────────────┤
│  GPS Devices  │  Payment Gateway  │  SMS/Email Service │
└────────┬────────────────┬────────────────┬──────────────┘
         │                │                │
         ▼                ▼                ▼
┌─────────────────────────────────────────────────────────┐
│              GPS-Based Lorry Management System           │
├─────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │  Admin   │  │ Manager  │  │  Driver  │             │
│  │Dashboard │  │Dashboard │  │Dashboard │             │
│  └──────────┘  └──────────┘  └──────────┘             │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │         Backend API (Node.js/Express)          │    │
│  └────────────────────────────────────────────────┘    │
│                        │                                │
│                        ▼                                │
│  ┌────────────────────────────────────────────────┐    │
│  │    Database (PostgreSQL - NeonDB)              │    │
│  └────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

**System Interfaces:**
- Web browsers (Chrome, Firefox, Safari, Edge)
- GPS tracking devices (future integration)
- Cloud database (NeonDB)

### 2.2 Product Functions

The major functions of the system include:

1. **User Management**
   - User registration and authentication
   - Role-based access control (Admin, Manager, Driver)
   - Profile management

2. **Lorry/Truck Management**
   - Add, view, update, and delete lorries
   - Track lorry status (Available, Assigned, Maintenance)
   - Manage insurance and fitness certificate expiry
   - Soft delete functionality

3. **Driver Management**
   - Add, view, update, and delete drivers
   - Manage driver licenses and expiry dates
   - Link drivers to user accounts
   - Track driver availability

4. **Trip Management**
   - Create and plan trips
   - Assign lorries and drivers to trips
   - Start and complete trips
   - Track trip status (Planned, Running, Completed, Cancelled)
   - Record trip details (source, destination, distance, freight amount)

5. **GPS Tracking**
   - Log GPS coordinates during trips
   - View real-time location of lorries
   - Calculate distances traveled
   - Generate route history

6. **Fuel Management**
   - Record fuel purchases
   - Track fuel consumption per trip
   - Calculate fuel costs
   - Generate fuel efficiency reports

7. **Maintenance Management**
   - Schedule and record maintenance activities
   - Track maintenance costs
   - View maintenance history
   - Set maintenance reminders

8. **Invoice Management**
   - Generate invoices for completed trips
   - Track payment status (Pending, Partial, Paid)
   - Manage advance and balance amounts
   - Generate invoice reports

9. **Reporting and Analytics**
   - Trip history reports
   - Fuel consumption reports
   - Revenue reports
   - Driver performance reports
   - Lorry utilization reports

### 2.3 User Classes and Characteristics

#### 2.3.1 Administrator
- **Description:** System administrator with full access to all features
- **Technical Expertise:** High
- **Frequency of Use:** Daily
- **Key Functions:**
  - Manage all users, lorries, and drivers
  - Configure system settings
  - View all reports and analytics
  - Manage invoices and payments

#### 2.3.2 Manager
- **Description:** Operations manager responsible for trip planning and monitoring
- **Technical Expertise:** Medium
- **Frequency of Use:** Daily
- **Key Functions:**
  - Plan and assign trips
  - Monitor ongoing trips
  - View reports and analytics
  - Manage fuel and maintenance records

#### 2.3.3 Driver
- **Description:** Lorry driver who executes trips
- **Technical Expertise:** Low to Medium
- **Frequency of Use:** Daily (during trips)
- **Key Functions:**
  - View assigned trips
  - Update trip status
  - View trip history
  - Update location (future feature)

### 2.4 Operating Environment

**Client-Side:**
- Web browsers: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- Screen resolution: Minimum 1280x720 (responsive design)
- Internet connection: Minimum 2 Mbps

**Server-Side:**
- Operating System: Windows Server 2019+ or Linux (Ubuntu 20.04+)
- Node.js: Version 18.x or higher
- Database: PostgreSQL 15+ (hosted on NeonDB)
- Web Server: Node.js built-in server or Nginx (for production)

**Network:**
- HTTPS protocol for secure communication
- SSL/TLS encryption
- Minimum bandwidth: 10 Mbps

### 2.5 Design and Implementation Constraints

1. **Technology Stack:**
   - Backend: Node.js with Express.js framework
   - Frontend: React.js
   - Database: PostgreSQL (NeonDB cloud hosting)
   - Authentication: JWT (JSON Web Tokens)

2. **Security Constraints:**
   - All passwords must be hashed using bcrypt
   - All API communications must use HTTPS
   - SQL injection prevention through parameterized queries
   - Role-based access control must be enforced

3. **Database Constraints:**
   - Must use NeonDB for cloud hosting
   - Must support connection pooling
   - Must implement foreign key constraints
   - Must support soft deletes for critical data

4. **Performance Constraints:**
   - Page load time: Maximum 3 seconds
   - API response time: Maximum 2 seconds
   - Support for minimum 100 concurrent users

5. **Regulatory Constraints:**
   - Must comply with data protection regulations
   - Must maintain audit logs for critical operations

### 2.6 Assumptions and Dependencies

**Assumptions:**
1. Users have basic computer literacy
2. Stable internet connection is available
3. GPS devices will be integrated in future phases
4. Users have access to modern web browsers

**Dependencies:**
1. NeonDB service availability and uptime
2. Third-party npm packages and their maintenance
3. Node.js runtime environment
4. PostgreSQL database compatibility

---

## 3. System Features

### 3.1 User Authentication and Authorization

**Priority:** High  
**Risk:** High

#### 3.1.1 Description
The system shall provide secure user authentication and role-based authorization to ensure that only authorized users can access the system and perform actions according to their roles.

#### 3.1.2 Functional Requirements

**FR-AUTH-001:** The system shall allow users to register with email, password, name, phone, and role.

**FR-AUTH-002:** The system shall validate email format and ensure email uniqueness.

**FR-AUTH-003:** The system shall hash passwords using bcrypt before storing in the database.

**FR-AUTH-004:** The system shall allow users to login with email and password.

**FR-AUTH-005:** The system shall generate JWT tokens upon successful login.

**FR-AUTH-006:** The system shall validate JWT tokens for all protected API endpoints.

**FR-AUTH-007:** The system shall implement role-based access control with three roles: Admin, Manager, and Driver.

**FR-AUTH-008:** The system shall restrict access to features based on user roles.

**FR-AUTH-009:** The system shall allow users to logout and invalidate their session.

**FR-AUTH-010:** The system shall display appropriate error messages for invalid credentials.

### 3.2 Lorry/Truck Management

**Priority:** High  
**Risk:** Medium

#### 3.2.1 Description
The system shall provide comprehensive lorry management capabilities including adding, viewing, updating, and tracking lorries.

#### 3.2.2 Functional Requirements

**FR-TRUCK-001:** The system shall allow authorized users to add new lorries with the following details:
- Truck number (unique)
- Capacity (in tons)
- Status (Available, Assigned, Maintenance)
- Insurance expiry date
- Fitness certificate expiry date

**FR-TRUCK-002:** The system shall validate truck number uniqueness.

**FR-TRUCK-003:** The system shall display a list of all lorries with their current status.

**FR-TRUCK-004:** The system shall allow filtering lorries by status.

**FR-TRUCK-005:** The system shall allow authorized users to update lorry details.

**FR-TRUCK-006:** The system shall allow authorized users to soft delete lorries.

**FR-TRUCK-007:** The system shall prevent deletion of lorries assigned to active trips.

**FR-TRUCK-008:** The system shall automatically update lorry status when assigned to a trip.

**FR-TRUCK-009:** The system shall display warnings for lorries with expiring insurance or fitness certificates (within 30 days).

**FR-TRUCK-010:** The system shall track and display lorry utilization statistics.

### 3.3 Driver Management

**Priority:** High  
**Risk:** Medium

#### 3.3.1 Description
The system shall provide driver management capabilities including registration, profile management, and assignment tracking.

#### 3.3.2 Functional Requirements

**FR-DRIVER-001:** The system shall allow authorized users to add new drivers with the following details:
- Name
- Phone number
- License number (unique)
- License expiry date
- Status (Available, Assigned)
- Optional: Link to user account

**FR-DRIVER-002:** The system shall validate license number uniqueness.

**FR-DRIVER-003:** The system shall display a list of all drivers with their current status.

**FR-DRIVER-004:** The system shall allow filtering drivers by status.

**FR-DRIVER-005:** The system shall allow authorized users to update driver details.

**FR-DRIVER-006:** The system shall allow authorized users to soft delete drivers.

**FR-DRIVER-007:** The system shall prevent deletion of drivers assigned to active trips.

**FR-DRIVER-008:** The system shall automatically update driver status when assigned to a trip.

**FR-DRIVER-009:** The system shall display warnings for drivers with expiring licenses (within 30 days).

**FR-DRIVER-010:** The system shall allow linking drivers to user accounts for login access.

**FR-DRIVER-011:** The system shall track and display driver performance metrics.

### 3.4 Trip Management

**Priority:** High  
**Risk:** High

#### 3.4.1 Description
The system shall provide comprehensive trip management from planning to completion, including assignment, tracking, and reporting.

#### 3.4.2 Functional Requirements

**FR-TRIP-001:** The system shall allow authorized users to create new trips with the following details:
- LR (Lorry Receipt) number (unique)
- Truck assignment
- Driver assignment
- Source location
- Destination location
- Freight amount
- Expected distance

**FR-TRIP-002:** The system shall validate LR number uniqueness.

**FR-TRIP-003:** The system shall validate that assigned truck and driver are available.

**FR-TRIP-004:** The system shall prevent assigning a truck or driver already on an active trip.

**FR-TRIP-005:** The system shall create trips in "Planned" status by default.

**FR-TRIP-006:** The system shall allow authorized users to start a trip, changing status from "Planned" to "Running".

**FR-TRIP-007:** The system shall record start time when a trip is started.

**FR-TRIP-008:** The system shall allow authorized users to complete a trip, changing status from "Running" to "Completed".

**FR-TRIP-009:** The system shall record end time when a trip is completed.

**FR-TRIP-010:** The system shall allow authorized users to cancel a trip.

**FR-TRIP-011:** The system shall update truck and driver status when trip status changes.

**FR-TRIP-012:** The system shall display a list of all trips with filtering by status.

**FR-TRIP-013:** The system shall display trip details including truck, driver, route, and status.

**FR-TRIP-014:** The system shall calculate and display trip duration for completed trips.

**FR-TRIP-015:** Drivers shall be able to view their assigned trips.

**FR-TRIP-016:** The system shall track actual distance traveled based on GPS logs.

### 3.5 GPS Tracking

**Priority:** Medium  
**Risk:** Medium

#### 3.5.1 Description
The system shall provide GPS tracking capabilities to monitor lorry locations in real-time and maintain location history.

#### 3.5.2 Functional Requirements

**FR-GPS-001:** The system shall allow logging of GPS coordinates (latitude, longitude) for trips.

**FR-GPS-002:** The system shall record timestamp for each GPS log entry.

**FR-GPS-003:** The system shall associate GPS logs with specific trucks and trips.

**FR-GPS-004:** The system shall display the last known location of lorries on active trips.

**FR-GPS-005:** The system shall calculate distance traveled based on GPS coordinates.

**FR-GPS-006:** The system shall display route history on a map (future enhancement).

**FR-GPS-007:** The system shall update trip distance automatically based on GPS logs.

**FR-GPS-008:** The system shall store GPS logs for historical analysis.

### 3.6 Fuel Management

**Priority:** Medium  
**Risk:** Low

#### 3.6.1 Description
The system shall track fuel consumption and costs for each trip to enable fuel expense management and efficiency analysis.

#### 3.6.2 Functional Requirements

**FR-FUEL-001:** The system shall allow authorized users to log fuel entries with the following details:
- Trip ID
- Liters purchased
- Price per liter
- Total cost
- Timestamp

**FR-FUEL-002:** The system shall calculate total cost automatically (liters × price per liter).

**FR-FUEL-003:** The system shall display fuel logs for each trip.

**FR-FUEL-004:** The system shall calculate total fuel cost per trip.

**FR-FUEL-005:** The system shall calculate fuel efficiency (km per liter) for completed trips.

**FR-FUEL-006:** The system shall generate fuel consumption reports by truck, driver, or time period.

**FR-FUEL-007:** The system shall display fuel cost trends and analytics.

### 3.7 Maintenance Management

**Priority:** Medium  
**Risk:** Low

#### 3.7.1 Description
The system shall track maintenance activities and costs to ensure lorries are properly maintained and to manage maintenance expenses.

#### 3.7.2 Functional Requirements

**FR-MAINT-001:** The system shall allow authorized users to record maintenance activities with the following details:
- Truck ID
- Service date
- Description
- Cost
- Timestamp

**FR-MAINT-002:** The system shall display maintenance history for each truck.

**FR-MAINT-003:** The system shall calculate total maintenance cost per truck.

**FR-MAINT-004:** The system shall generate maintenance reports by truck or time period.

**FR-MAINT-005:** The system shall allow scheduling future maintenance (future enhancement).

**FR-MAINT-006:** The system shall send reminders for scheduled maintenance (future enhancement).

### 3.8 Invoice Management

**Priority:** High  
**Risk:** Medium

#### 3.8.1 Description
The system shall generate and track invoices for completed trips, including payment status and amounts.

#### 3.8.2 Functional Requirements

**FR-INV-001:** The system shall allow authorized users to create invoices with the following details:
- Trip ID
- Total amount
- Advance amount
- Balance amount
- Payment status (Pending, Partial, Paid)
- Invoice date

**FR-INV-002:** The system shall calculate balance amount automatically (total - advance).

**FR-INV-003:** The system shall display a list of all invoices with filtering by payment status.

**FR-INV-004:** The system shall allow updating payment status and amounts.

**FR-INV-005:** The system shall prevent creating multiple invoices for the same trip.

**FR-INV-006:** The system shall generate invoice reports by time period or payment status.

**FR-INV-007:** The system shall calculate total revenue and outstanding payments.

**FR-INV-008:** The system shall display invoice details including trip information.

### 3.9 Reporting and Analytics

**Priority:** Medium  
**Risk:** Low

#### 3.9.1 Description
The system shall provide comprehensive reporting and analytics capabilities for business intelligence and decision-making.

#### 3.9.2 Functional Requirements

**FR-REPORT-001:** The system shall generate trip history reports with filtering options.

**FR-REPORT-002:** The system shall generate fuel consumption reports by truck, driver, or time period.

**FR-REPORT-003:** The system shall generate revenue reports showing total earnings and outstanding payments.

**FR-REPORT-004:** The system shall generate driver performance reports including trips completed and efficiency.

**FR-REPORT-005:** The system shall generate truck utilization reports showing active vs. idle time.

**FR-REPORT-006:** The system shall generate maintenance cost reports by truck or time period.

**FR-REPORT-007:** The system shall display dashboard with key performance indicators (KPIs).

**FR-REPORT-008:** The system shall allow exporting reports to PDF or Excel format (future enhancement).

---

## 4. External Interface Requirements

### 4.1 User Interfaces

#### 4.1.1 General UI Requirements

**UI-001:** The system shall provide a responsive web interface that works on desktop, tablet, and mobile devices.

**UI-002:** The system shall use a consistent design language across all pages.

**UI-003:** The system shall provide clear navigation with a menu bar or sidebar.

**UI-004:** The system shall display the current user's name and role in the header.

**UI-005:** The system shall provide a logout button accessible from all pages.

**UI-006:** The system shall display loading indicators during data fetching operations.

**UI-007:** The system shall display success and error messages for user actions.

**UI-008:** The system shall use intuitive icons and labels for actions.

#### 4.1.2 Login Page

**UI-LOGIN-001:** The login page shall contain fields for email and password.

**UI-LOGIN-002:** The login page shall have a "Login" button.

**UI-LOGIN-003:** The login page shall display error messages for invalid credentials.

**UI-LOGIN-004:** The login page shall have a link to the registration page.

#### 4.1.3 Dashboard

**UI-DASH-001:** The dashboard shall display role-specific information and quick actions.

**UI-DASH-002:** The admin dashboard shall show:
- Total trucks, drivers, and trips
- Active trips count
- Recent activities
- Alerts for expiring documents

**UI-DASH-003:** The manager dashboard shall show:
- Active trips with status
- Available trucks and drivers
- Quick trip creation
- Fuel and maintenance summaries

**UI-DASH-004:** The driver dashboard shall show:
- Assigned trips
- Trip history
- Current trip status (if on a trip)

#### 4.1.4 Truck Management UI

**UI-TRUCK-001:** The truck list page shall display trucks in a table or card layout.

**UI-TRUCK-002:** Each truck entry shall show: truck number, capacity, status, and action buttons.

**UI-TRUCK-003:** The page shall have an "Add Truck" button.

**UI-TRUCK-004:** The page shall have filter options for status.

**UI-TRUCK-005:** The add/edit truck form shall have fields for all truck attributes.

**UI-TRUCK-006:** The form shall validate required fields and data formats.

#### 4.1.5 Driver Management UI

**UI-DRIVER-001:** The driver list page shall display drivers in a table or card layout.

**UI-DRIVER-002:** Each driver entry shall show: name, phone, license number, status, and action buttons.

**UI-DRIVER-003:** The page shall have an "Add Driver" button.

**UI-DRIVER-004:** The page shall have filter options for status.

**UI-DRIVER-005:** The add/edit driver form shall have fields for all driver attributes.

**UI-DRIVER-006:** The form shall validate required fields and data formats.

#### 4.1.6 Trip Management UI

**UI-TRIP-001:** The trip list page shall display trips in a table layout.

**UI-TRIP-002:** Each trip entry shall show: LR number, truck, driver, route, status, and action buttons.

**UI-TRIP-003:** The page shall have a "Create Trip" button.

**UI-TRIP-004:** The page shall have filter options for status.

**UI-TRIP-005:** The create trip form shall have dropdowns for truck and driver selection.

**UI-TRIP-006:** The form shall show only available trucks and drivers.

**UI-TRIP-007:** The trip details page shall show all trip information including fuel logs and GPS logs.

### 4.2 Hardware Interfaces

**HW-001:** The system shall be accessible via standard computer hardware (desktop, laptop, tablet).

**HW-002:** The system shall support GPS device integration for location tracking (future phase).

**HW-003:** The system shall support barcode/QR code scanners for LR number entry (future enhancement).

### 4.3 Software Interfaces

#### 4.3.1 Database Interface

**SW-DB-001:** The system shall interface with PostgreSQL database hosted on NeonDB.

**SW-DB-002:** The system shall use the `pg` (node-postgres) library for database connectivity.

**SW-DB-003:** The system shall use connection pooling for efficient database access.

**SW-DB-004:** The system shall use SSL/TLS for database connections.

#### 4.3.2 External APIs (Future)

**SW-API-001:** The system shall integrate with GPS tracking service APIs (future phase).

**SW-API-002:** The system shall integrate with SMS gateway for notifications (future phase).

**SW-API-003:** The system shall integrate with email service for notifications (future phase).

**SW-API-004:** The system shall integrate with payment gateway for online payments (future phase).

### 4.4 Communication Interfaces

**COMM-001:** The system shall use HTTPS protocol for all client-server communication.

**COMM-002:** The system shall use RESTful API architecture for backend services.

**COMM-003:** The system shall use JSON format for data exchange.

**COMM-004:** The system shall implement CORS (Cross-Origin Resource Sharing) for frontend-backend communication.

**COMM-005:** The system shall use WebSocket for real-time updates (future enhancement).

---

## 5. Non-Functional Requirements

### 5.1 Performance Requirements

**NFR-PERF-001:** The system shall support at least 100 concurrent users without performance degradation.

**NFR-PERF-002:** The system shall load pages within 3 seconds on a standard broadband connection.

**NFR-PERF-003:** API responses shall be returned within 2 seconds for 95% of requests.

**NFR-PERF-004:** The database shall support at least 10,000 trip records without performance issues.

**NFR-PERF-005:** The system shall handle at least 1,000 GPS log entries per hour.

**NFR-PERF-006:** Search and filter operations shall return results within 1 second.

### 5.2 Security Requirements

**NFR-SEC-001:** All user passwords shall be hashed using bcrypt with a minimum salt rounds of 10.

**NFR-SEC-002:** The system shall use JWT tokens for authentication with expiration time.

**NFR-SEC-003:** All API endpoints (except login/register) shall require valid JWT tokens.

**NFR-SEC-004:** The system shall implement role-based access control for all features.

**NFR-SEC-005:** The system shall use HTTPS for all communications in production.

**NFR-SEC-006:** The system shall use parameterized queries to prevent SQL injection.

**NFR-SEC-007:** The system shall validate and sanitize all user inputs.

**NFR-SEC-008:** The system shall implement rate limiting to prevent brute force attacks.

**NFR-SEC-009:** The system shall log all authentication attempts (success and failure).

**NFR-SEC-010:** Sensitive data (passwords, tokens) shall never be logged or displayed in plain text.

### 5.3 Reliability Requirements

**NFR-REL-001:** The system shall have 99% uptime during business hours (8 AM - 8 PM).

**NFR-REL-002:** The system shall implement error handling for all API endpoints.

**NFR-REL-003:** The system shall gracefully handle database connection failures.

**NFR-REL-004:** The system shall implement automatic retry logic for failed operations.

**NFR-REL-005:** The system shall maintain data integrity through database transactions.

**NFR-REL-006:** The system shall implement database backups daily.

**NFR-REL-007:** The system shall recover from crashes without data loss.

### 5.4 Availability Requirements

**NFR-AVAIL-001:** The system shall be available 24/7 with planned maintenance windows.

**NFR-AVAIL-002:** Planned maintenance shall be scheduled during off-peak hours.

**NFR-AVAIL-003:** Users shall be notified at least 24 hours before planned maintenance.

**NFR-AVAIL-004:** The system shall have a maximum downtime of 4 hours per month.

### 5.5 Maintainability Requirements

**NFR-MAINT-001:** The system shall follow modular architecture for easy maintenance.

**NFR-MAINT-002:** The code shall follow consistent coding standards and conventions.

**NFR-MAINT-003:** The system shall have comprehensive inline code documentation.

**NFR-MAINT-004:** The system shall have separate configuration files for different environments.

**NFR-MAINT-005:** The system shall use version control (Git) for code management.

**NFR-MAINT-006:** The system shall have automated deployment scripts.

### 5.6 Portability Requirements

**NFR-PORT-001:** The system shall run on Windows Server and Linux operating systems.

**NFR-PORT-002:** The frontend shall work on Chrome, Firefox, Safari, and Edge browsers.

**NFR-PORT-003:** The system shall be deployable on cloud platforms (AWS, Azure, Google Cloud).

**NFR-PORT-004:** The system shall use environment variables for configuration to support multiple environments.

### 5.7 Usability Requirements

**NFR-USE-001:** The system shall have an intuitive user interface requiring minimal training.

**NFR-USE-002:** The system shall provide helpful error messages and validation feedback.

**NFR-USE-003:** The system shall have consistent navigation across all pages.

**NFR-USE-004:** The system shall support keyboard navigation for accessibility.

**NFR-USE-005:** The system shall have a responsive design that works on different screen sizes.

**NFR-USE-006:** The system shall provide tooltips and help text for complex features.

**NFR-USE-007:** The system shall complete common tasks (create trip, add truck) in less than 5 clicks.

### 5.8 Scalability Requirements

**NFR-SCALE-001:** The system architecture shall support horizontal scaling.

**NFR-SCALE-002:** The database shall support sharding for future growth.

**NFR-SCALE-003:** The system shall handle 10x growth in data volume without major refactoring.

**NFR-SCALE-004:** The system shall support adding new features without affecting existing functionality.

---

## 6. Database Requirements

### 6.1 Database Architecture

**DB-ARCH-001:** The system shall use PostgreSQL as the relational database management system.

**DB-ARCH-002:** The database shall be hosted on NeonDB cloud platform.

**DB-ARCH-003:** The system shall use connection pooling with a maximum of 20 connections.

**DB-ARCH-004:** The database shall use SSL/TLS for all connections.

### 6.2 Database Schema

The database shall consist of the following tables:

#### 6.2.1 Users Table
- **Purpose:** Store user account information
- **Primary Key:** user_id (SERIAL)
- **Unique Constraints:** email
- **Fields:**
  - user_id: SERIAL PRIMARY KEY
  - email: VARCHAR(255) UNIQUE NOT NULL
  - password_hash: VARCHAR(255) NOT NULL
  - role: VARCHAR(50) NOT NULL CHECK(role IN ('admin', 'driver', 'manager'))
  - name: VARCHAR(100) NOT NULL
  - phone: VARCHAR(20)
  - created_at: TIMESTAMP DEFAULT NOW()

#### 6.2.2 Trucks Table
- **Purpose:** Store lorry/truck information
- **Primary Key:** truck_id (SERIAL)
- **Unique Constraints:** truck_number
- **Fields:**
  - truck_id: SERIAL PRIMARY KEY
  - truck_number: VARCHAR(50) UNIQUE NOT NULL
  - capacity: DECIMAL(10,2) NOT NULL
  - status: VARCHAR(20) DEFAULT 'Available' CHECK(status IN ('Available', 'Assigned', 'Maintenance'))
  - insurance_expiry: DATE NOT NULL
  - fitness_expiry: DATE NOT NULL
  - deleted_at: TIMESTAMP NULL
  - created_at: TIMESTAMP DEFAULT NOW()

#### 6.2.3 Drivers Table
- **Purpose:** Store driver information
- **Primary Key:** driver_id (SERIAL)
- **Unique Constraints:** license_number, user_id
- **Foreign Keys:** user_id → users(user_id), assigned_truck_id → trucks(truck_id)
- **Fields:**
  - driver_id: SERIAL PRIMARY KEY
  - user_id: INTEGER UNIQUE NULL REFERENCES users(user_id)
  - name: VARCHAR(100) NOT NULL
  - phone: VARCHAR(20) NOT NULL
  - license_number: VARCHAR(50) UNIQUE NOT NULL
  - license_expiry: DATE NOT NULL
  - status: VARCHAR(20) DEFAULT 'Available' CHECK(status IN ('Available', 'Assigned'))
  - assigned_truck_id: INTEGER NULL REFERENCES trucks(truck_id)
  - deleted_at: TIMESTAMP NULL
  - created_at: TIMESTAMP DEFAULT NOW()

#### 6.2.4 Trips Table
- **Purpose:** Store trip information
- **Primary Key:** trip_id (SERIAL)
- **Unique Constraints:** lr_number
- **Foreign Keys:** truck_id → trucks(truck_id), driver_id → drivers(driver_id)
- **Fields:**
  - trip_id: SERIAL PRIMARY KEY
  - truck_id: INTEGER NOT NULL REFERENCES trucks(truck_id)
  - driver_id: INTEGER NOT NULL REFERENCES drivers(driver_id)
  - lr_number: VARCHAR(50) UNIQUE NOT NULL
  - source: VARCHAR(100) NOT NULL
  - destination: VARCHAR(100) NOT NULL
  - distance_km: DECIMAL(10,2) DEFAULT 0
  - freight_amount: DECIMAL(10,2) DEFAULT 0
  - start_time: TIMESTAMP
  - end_time: TIMESTAMP
  - status: VARCHAR(20) DEFAULT 'Planned' CHECK(status IN ('Planned', 'Running', 'Completed', 'Cancelled'))
  - created_at: TIMESTAMP DEFAULT NOW()

#### 6.2.5 GPS Logs Table
- **Purpose:** Store GPS location data
- **Primary Key:** gps_id (SERIAL)
- **Foreign Keys:** truck_id → trucks(truck_id), trip_id → trips(trip_id)
- **Fields:**
  - gps_id: SERIAL PRIMARY KEY
  - truck_id: INTEGER NOT NULL REFERENCES trucks(truck_id)
  - trip_id: INTEGER NOT NULL REFERENCES trips(trip_id)
  - latitude: DECIMAL(9,6) NOT NULL
  - longitude: DECIMAL(9,6) NOT NULL
  - recorded_at: TIMESTAMP DEFAULT NOW()

#### 6.2.6 Fuel Logs Table
- **Purpose:** Store fuel consumption data
- **Primary Key:** fuel_id (SERIAL)
- **Foreign Keys:** trip_id → trips(trip_id)
- **Fields:**
  - fuel_id: SERIAL PRIMARY KEY
  - trip_id: INTEGER NOT NULL REFERENCES trips(trip_id)
  - liters: DECIMAL(10,2) NOT NULL
  - price_per_liter: DECIMAL(10,2) NOT NULL
  - total_cost: DECIMAL(10,2) NOT NULL
  - created_at: TIMESTAMP DEFAULT NOW()

#### 6.2.7 Maintenance Table
- **Purpose:** Store maintenance records
- **Primary Key:** maintenance_id (SERIAL)
- **Foreign Keys:** truck_id → trucks(truck_id)
- **Fields:**
  - maintenance_id: SERIAL PRIMARY KEY
  - truck_id: INTEGER NOT NULL REFERENCES trucks(truck_id)
  - service_date: DATE NOT NULL
  - description: TEXT NOT NULL
  - cost: DECIMAL(10,2) NOT NULL
  - created_at: TIMESTAMP DEFAULT NOW()

#### 6.2.8 Invoices Table
- **Purpose:** Store invoice information
- **Primary Key:** invoice_id (SERIAL)
- **Foreign Keys:** trip_id → trips(trip_id)
- **Fields:**
  - invoice_id: SERIAL PRIMARY KEY
  - trip_id: INTEGER NOT NULL REFERENCES trips(trip_id)
  - total_amount: DECIMAL(10,2) NOT NULL
  - advance_amount: DECIMAL(10,2) DEFAULT 0
  - balance_amount: DECIMAL(10,2) DEFAULT 0
  - payment_status: VARCHAR(20) DEFAULT 'Pending' CHECK(payment_status IN ('Pending', 'Paid', 'Partial'))
  - invoice_date: DATE NOT NULL
  - created_at: TIMESTAMP DEFAULT NOW()

### 6.3 Database Indexes

**DB-INDEX-001:** Index on users(email) for fast login queries

**DB-INDEX-002:** Index on drivers(user_id) for user-driver lookup

**DB-INDEX-003:** Index on trips(truck_id) for truck trip history

**DB-INDEX-004:** Index on trips(driver_id) for driver trip history

**DB-INDEX-005:** Index on trips(status) for filtering trips by status

**DB-INDEX-006:** Index on gps_logs(trip_id) for trip location history

**DB-INDEX-007:** Index on fuel_logs(trip_id) for trip fuel consumption

### 6.4 Database Constraints

**DB-CONST-001:** All foreign key constraints shall use ON DELETE SET NULL or ON DELETE CASCADE as appropriate

**DB-CONST-002:** CHECK constraints shall enforce valid enum values for status fields

**DB-CONST-003:** NOT NULL constraints shall be applied to all required fields

**DB-CONST-004:** UNIQUE constraints shall prevent duplicate entries for key identifiers

### 6.5 Data Backup and Recovery

**DB-BACKUP-001:** The database shall be backed up daily at 2:00 AM

**DB-BACKUP-002:** Backups shall be retained for 30 days

**DB-BACKUP-003:** The system shall support point-in-time recovery

**DB-BACKUP-004:** Backup restoration procedures shall be tested monthly

---

## 7. Appendices

### 7.1 Appendix A: Glossary

| Term | Definition |
|------|------------|
| **Lorry** | A large, heavy motor vehicle for transporting goods or troops; a truck |
| **LR Number** | Lorry Receipt Number - A unique identifier for each shipment |
| **Freight** | Goods transported in bulk by truck, train, ship, or aircraft |
| **Soft Delete** | Marking a record as deleted without physically removing it from the database |
| **JWT** | JSON Web Token - A compact, URL-safe means of representing claims to be transferred between two parties |
| **API** | Application Programming Interface - A set of functions and procedures allowing the creation of applications that access features or data |
| **CRUD** | Create, Read, Update, Delete - The four basic operations of persistent storage |

### 7.2 Appendix B: Use Case Diagrams

#### Use Case: Trip Management

```
┌─────────────────────────────────────────────────────────┐
│                    Trip Management                       │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Admin/Manager                                           │
│       │                                                  │
│       ├──> Create Trip                                   │
│       ├──> Assign Truck & Driver                         │
│       ├──> Start Trip                                    │
│       ├──> View Trip Status                              │
│       ├──> Complete Trip                                 │
│       └──> Generate Reports                              │
│                                                          │
│  Driver                                                  │
│       │                                                  │
│       ├──> View Assigned Trips                           │
│       ├──> Update Trip Status                            │
│       └──> View Trip History                             │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 7.3 Appendix C: Data Flow Diagrams

#### Level 0 DFD: Context Diagram

```
┌──────────┐                                    ┌──────────┐
│          │    Login Credentials               │          │
│  Users   ├───────────────────────────────────▶│          │
│ (Admin,  │                                    │   GPS    │
│ Manager, │◀───────────────────────────────────┤  Lorry   │
│ Driver)  │    Dashboard & Reports             │Management│
│          │                                    │  System  │
└──────────┘                                    │          │
                                                │          │
┌──────────┐                                    │          │
│          │    GPS Coordinates                 │          │
│   GPS    ├───────────────────────────────────▶│          │
│ Devices  │                                    │          │
│          │                                    │          │
└──────────┘                                    └────┬─────┘
                                                     │
                                                     │ Store/Retrieve
                                                     ▼
                                                ┌─────────┐
                                                │ NeonDB  │
                                                │Database │
                                                └─────────┘
```

### 7.4 Appendix D: Sample Screens (Wireframes)

#### Login Screen
```
┌────────────────────────────────────────────┐
│  GPS-Based Lorry Management System         │
│                                            │
│  ┌──────────────────────────────────────┐ │
│  │  Email:    [________________]        │ │
│  │                                      │ │
│  │  Password: [________________]        │ │
│  │                                      │ │
│  │            [  Login  ]               │ │
│  │                                      │ │
│  │  Don't have an account? Register    │ │
│  └──────────────────────────────────────┘ │
│                                            │
└────────────────────────────────────────────┘
```

#### Admin Dashboard
```
┌────────────────────────────────────────────────────────┐
│ Dashboard | Trucks | Drivers | Trips | Reports | Logout│
├────────────────────────────────────────────────────────┤
│  Welcome, Admin                                        │
│                                                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │ Trucks   │  │ Drivers  │  │  Trips   │            │
│  │   8      │  │    6     │  │   12     │            │
│  └──────────┘  └──────────┘  └──────────┘            │
│                                                        │
│  Active Trips                                          │
│  ┌────────────────────────────────────────────────┐   │
│  │ LR2024008 | Chennai → Coimbatore | Running    │   │
│  │ LR2024009 | Mumbai → Goa         | Running    │   │
│  └────────────────────────────────────────────────┘   │
│                                                        │
│  Alerts                                                │
│  ┌────────────────────────────────────────────────┐   │
│  │ ⚠ TN01AB1234 insurance expiring in 15 days    │   │
│  │ ⚠ Driver Rajesh Kumar license expiring soon   │   │
│  └────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────┘
```

### 7.5 Appendix E: Technology Stack Details

#### Backend
- **Runtime:** Node.js 18.x
- **Framework:** Express.js 4.x
- **Database Driver:** pg (node-postgres) 8.x
- **Authentication:** jsonwebtoken 9.x
- **Password Hashing:** bcryptjs 3.x
- **Environment Variables:** dotenv 16.x
- **CORS:** cors 2.x

#### Frontend
- **Framework:** React.js 18.x
- **State Management:** React Context API / Redux (optional)
- **HTTP Client:** Axios
- **Routing:** React Router
- **UI Components:** Material-UI / Bootstrap (to be decided)

#### Database
- **DBMS:** PostgreSQL 15+
- **Hosting:** NeonDB (cloud-hosted)
- **Connection:** SSL/TLS encrypted

#### Development Tools
- **Version Control:** Git
- **Code Editor:** VS Code
- **API Testing:** Postman
- **Package Manager:** npm

### 7.6 Appendix F: Future Enhancements

#### Phase 2 Features
1. **Mobile Application**
   - Native iOS and Android apps for drivers
   - Real-time GPS tracking from mobile devices
   - Push notifications for trip updates

2. **Advanced Analytics**
   - Predictive maintenance using machine learning
   - Route optimization algorithms
   - Fuel consumption predictions

3. **Customer Portal**
   - Customer login for tracking shipments
   - Real-time shipment status
   - Digital proof of delivery

4. **Integration Features**
   - Integration with accounting software
   - Integration with third-party logistics platforms
   - SMS and email notifications
   - Payment gateway integration

5. **Enhanced GPS Features**
   - Real-time map visualization
   - Geofencing and alerts
   - Automated ETA calculations
   - Route deviation alerts

6. **Document Management**
   - Upload and store documents (insurance, fitness certificates, licenses)
   - Automated expiry reminders
   - Digital signatures for LR

### 7.7 Appendix G: Assumptions and Risks

#### Assumptions
1. Users have stable internet connectivity
2. GPS devices will be integrated in future phases
3. NeonDB service will maintain 99.9% uptime
4. Users have basic computer literacy
5. Modern web browsers are available to all users

#### Risks and Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| NeonDB service downtime | High | Low | Implement local caching, have backup database plan |
| Data breach | High | Medium | Implement strong security measures, regular audits |
| User adoption resistance | Medium | Medium | Provide training, ensure intuitive UI |
| Performance issues with scale | Medium | Medium | Implement caching, optimize queries, plan for scaling |
| GPS device integration delays | Low | High | Design system to work without GPS initially |
| Third-party API failures | Medium | Low | Implement fallback mechanisms, error handling |

---

## Document Approval

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Project Manager | | | |
| Technical Lead | | | |
| Business Analyst | | | |
| Client Representative | | | |

---

**End of Document**

*This SRS document is subject to change based on project requirements and stakeholder feedback. All changes must be documented and approved through the change management process.*
