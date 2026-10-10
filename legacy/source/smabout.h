#ifndef SMABOUT_H
#define SMABOUT_H

#include <qvariant.h>
#include <qpixmap.h>
#include <qdialog.h>

class QVBoxLayout;
class QHBoxLayout;
class QGridLayout;
class QLabel;

class SMAbout : public QDialog
{
    Q_OBJECT

public:
    SMAbout( QWidget* parent = 0, const char* name = 0, bool modal = FALSE, WFlags fl = 0 );
    ~SMAbout();

    QLabel* pixmapLabel1;
    QLabel* textLabel1;

protected:

protected slots:
    virtual void languageChange();

private:
    QPixmap image0;

};

#endif
