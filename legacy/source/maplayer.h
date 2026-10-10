#ifndef MAPLAYER_H
#define MAPLAYER_H

#include "shape.h"
#include "shapetype.h"
#include "nullshape.h"
#include "shapepoint.h"
#include "shapepolygon.h"
#include "shapepolyline.h"
#include <qdir.h>
#include <qfile.h>
#include <qcolor.h>
#include <qptrlist.h>
#include <qobject.h>
#include <qdatastream.h>
#include <qpainter.h>
#include <qmessagebox.h>
#include <qdatetime.h>
#include <stdlib.h>

class MapLayer: public QObject {
Q_OBJECT
public:
    MapLayer( QObject* parent, const QString& shapefile, QColor fillColor, QColor lineColor );
    virtual ~MapLayer();
    bool valid();
    bool visible();
    QString errorMessage();
    QString name();
    void setName( const QString& newName );
    QColor fillColor();
    void setFillColor( const QColor& color );
    QColor lineColor();
    void setLineColor( const QColor& color );
    int shapeType();
    int fileCode();
    int version();
    int fileLength();
    QString shpPath();

signals:
    void drawn( const QString& layerName = "" );
    void nameChanged( const QString& newName );

public slots:
	void draw( double scaleFactor, QPainter& painter );
	void setVisible( bool flag );

private:
	QPtrList<Shape> *shapes;
	bool _valid;
	bool _visible;
	QString _error;
	QString _name;
	QString _path;
	QColor _fillColor;
	QColor _lineColor;
	int _shapeType;
	int _shapeCount;
	int _fileCode;
	int _version;
	int _fileLength;
	int _boundingBox[8];
};

#endif
