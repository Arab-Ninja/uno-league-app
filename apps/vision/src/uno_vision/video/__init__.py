"""Couche lourde : décodage vidéo, détection, OCR, extraction de clips.

Tout ce qui dépend d'OpenCV, d'Ultralytics ou d'un GPU vit ici, et nulle part
ailleurs. Les imports sont volontairement différés à l'intérieur des fonctions :
importer `uno_vision` ne doit jamais charger PyTorch, sans quoi la moitié
« raisonnement » du paquet cesserait de tourner en intégration continue.
"""
