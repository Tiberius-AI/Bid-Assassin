-- ============================================================
-- Migration 003: Seed naics_trade_map with construction/service trades
-- ============================================================
-- Safe to re-run: deletes existing rows and re-inserts.

TRUNCATE TABLE naics_trade_map RESTART IDENTITY CASCADE;

INSERT INTO naics_trade_map (naics_code, naics_description, trade, relevance_weight) VALUES

-- General Construction
('236220', 'Commercial and Institutional Building Construction', 'General Contractor', 1.0),
('236220', 'Commercial and Institutional Building Construction', 'Construction Management', 0.8),
('236210', 'Industrial Building Construction',                  'General Contractor', 0.9),
('236118', 'Residential Remodelers',                           'General Contractor', 0.7),

-- Roofing
('238160', 'Roofing Contractors',                              'Roofing', 1.0),

-- Electrical
('238210', 'Electrical Contractors and Other Wiring Installation Contractors', 'Electrical', 1.0),
('238290', 'Other Building Equipment Contractors',             'Electrical', 0.7),
('238290', 'Other Building Equipment Contractors',             'Low Voltage', 0.6),

-- Plumbing / HVAC
('238220', 'Plumbing, Heating, and Air-Conditioning Contractors', 'Plumbing', 0.8),
('238220', 'Plumbing, Heating, and Air-Conditioning Contractors', 'HVAC', 0.8),
('238220', 'Plumbing, Heating, and Air-Conditioning Contractors', 'Mechanical', 0.7),

-- Drywall / Insulation
('238310', 'Drywall and Insulation Contractors',               'Drywall', 1.0),
('238310', 'Drywall and Insulation Contractors',               'Insulation', 0.9),

-- Painting
('238320', 'Painting and Wall Covering Contractors',           'Painting', 1.0),
('238320', 'Painting and Wall Covering Contractors',           'Coatings', 0.8),

-- Flooring
('238330', 'Flooring Contractors',                             'Flooring', 1.0),
('238340', 'Tile and Terrazzo Contractors',                    'Flooring', 1.0),
('238340', 'Tile and Terrazzo Contractors',                    'Tile', 1.0),

-- Carpentry / Millwork
('238350', 'Finish Carpentry Contractors',                     'Carpentry', 1.0),
('238350', 'Finish Carpentry Contractors',                     'Millwork', 0.8),
('238130', 'Framing Contractors',                              'Carpentry', 0.9),
('238130', 'Framing Contractors',                              'Framing', 1.0),

-- Concrete / Masonry
('238110', 'Poured Concrete Foundation and Structure Contractors', 'Concrete', 1.0),
('238120', 'Structural Steel and Precast Concrete Contractors', 'Concrete', 0.8),
('238120', 'Structural Steel and Precast Concrete Contractors', 'Steel Erection', 0.9),
('238140', 'Masonry Contractors',                              'Masonry', 1.0),
('238140', 'Masonry Contractors',                              'Concrete', 0.6),

-- Excavation / Site Work
('238910', 'Site Preparation Contractors',                     'Excavation', 1.0),
('238910', 'Site Preparation Contractors',                     'Grading', 0.9),
('238910', 'Site Preparation Contractors',                     'Demolition', 0.7),
('237310', 'Highway, Street, and Bridge Construction',         'Paving', 1.0),
('237310', 'Highway, Street, and Bridge Construction',         'Excavation', 0.6),
('237990', 'Other Heavy and Civil Engineering Construction',   'Excavation', 0.7),
('237990', 'Other Heavy and Civil Engineering Construction',   'Civil', 0.9),

-- Glazing / Windows
('238150', 'Glass and Glazing Contractors',                    'Glazing', 1.0),
('238150', 'Glass and Glazing Contractors',                    'Windows', 0.9),

-- Other Specialty Trades
('238190', 'Other Foundation, Structure, and Building Exterior Contractors', 'General Contractor', 0.6),
('238990', 'All Other Specialty Trade Contractors',            'General Contractor', 0.5),
('238990', 'All Other Specialty Trade Contractors',            'Specialty Trades', 1.0),

-- Fire Protection
('238290', 'Other Building Equipment Contractors',             'Fire Protection', 0.7),

-- Elevator / Conveying
('238290', 'Other Building Equipment Contractors',             'Elevator', 0.6),

-- Janitorial / Cleaning
('561720', 'Janitorial Services',                              'Janitorial', 1.0),
('561720', 'Janitorial Services',                              'Cleaning', 1.0),
('561790', 'Other Services to Buildings and Dwellings',        'Janitorial', 0.7),
('561790', 'Other Services to Buildings and Dwellings',        'Cleaning', 0.7),

-- Landscaping / Grounds
('561730', 'Landscaping Services',                             'Landscaping', 1.0),
('561730', 'Landscaping Services',                             'Grounds Maintenance', 0.9),
('561730', 'Landscaping Services',                             'Snow Removal', 0.6),

-- Waste / Junk Removal
('562111', 'Solid Waste Collection',                           'Junk Removal', 0.7),
('562111', 'Solid Waste Collection',                           'Waste Management', 1.0),
('562119', 'Other Waste Collection',                           'Junk Removal', 0.8),
('562119', 'Other Waste Collection',                           'Waste Management', 0.9),
('562920', 'Materials Recovery Facilities',                    'Waste Management', 0.7),

-- Equipment / Machinery Repair
('811310', 'Commercial and Industrial Machinery and Equipment Repair and Maintenance', 'Equipment Repair', 1.0),
('811310', 'Commercial and Industrial Machinery and Equipment Repair and Maintenance', 'Mechanical', 0.6),

-- Security Systems
('561621', 'Security Systems Services (except Locksmiths)',    'Security Systems', 1.0),
('561621', 'Security Systems Services (except Locksmiths)',    'Low Voltage', 0.7),

-- Pest Control
('561710', 'Exterminating and Pest Control Services',          'Pest Control', 1.0),

-- Moving / Relocation
('484210', 'Used Household and Office Goods Moving',           'Moving', 1.0),
('484210', 'Used Household and Office Goods Moving',           'Relocation Services', 0.9);
