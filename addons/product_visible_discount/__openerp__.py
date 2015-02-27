# -*- coding: utf-8 -*-

{
    'name': 'Prices Visible Discounts',
    'version': '1.0',
    'author': 'Odoo SA',
    'category': 'Sales Management',
    'website': 'https://www.odoo.com',
    'description': """
This module lets you calculate discounts on Sale Order lines and Invoice lines base on the partner's pricelist.
===============================================================================================================

To this end, a new check box named 'Visible Discount' is added to the pricelist form.

**Example:**
    For the product PC1 and the partner "Asustek": if listprice=450, and the price
    calculated using Asustek's pricelist is 225. If the check box is checked, we
    will have on the sale order line: Unit price=450, Discount=50,00, Net price=225.
    If the check box is unchecked, we will have on Sale Order and Invoice lines:
    Unit price=225, Discount=0,00, Net price=225.
    """,
    'depends': ["sale","purchase"],
    'demo': [],
    'data': ['views/product_visible_discount_view.xml'],
    'installable': True,
}
