# -*- coding: utf-8 -*-

{
    'name': 'Website Google Map',
    'category': 'Hidden',
    'summary': '',
    'version': '1.0',
    'description': """
OpenERP Website Google Map
==========================

        """,
    'author': 'Odoo SA',
    'depends': ['base_geolocalize', 'website_partner', 'crm_partner_assign'],
    'data': [
        'views/google_map.xml',
    ],
    'installable': True,
}
